"""Supervisor daemon for continuous XY Poker self-play training.

Features:
- Monitors and resumes training sessions in bounded time blocks (e.g. 30 minutes).
- Adopts already running training process if present.
- Manages disk space and prunes intermediate generation checkpoints while preserving:
  * Baseline model (model-00002.pt)
  * Milestone models (every N generations)
  * Recent generation models
  * latest.pt
- Handles graceful and immediate stops via stop.flag or signals.
- Halts safely on repeated errors or low disk space.
"""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

def log_event(log_path: Path, event_type: str, **kwargs):
    entry = {
        "time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "event": event_type,
        **kwargs
    }
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"[{entry['time']}] {event_type}: {kwargs}", flush=True)

def is_pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False

def check_disk_space(path: Path, min_free_mb: int = 1024):
    total, used, free = shutil.disk_usage(path)
    free_mb = free // (1024 * 1024)
    if free_mb < min_free_mb:
        raise RuntimeError(f"Low disk space: {free_mb} MB available, minimum {min_free_mb} MB required.")
    return free_mb

def prune_checkpoints(directory: Path, keep_every: int = 10, keep_recent: int = 5, protected_models = None):
    if protected_models is None:
        protected_models = {"model-00002.pt"}
    else:
        protected_models = set(protected_models)
        protected_models.add("model-00002.pt")

    model_files = sorted(directory.glob("model-*.pt"))
    generations = []
    for f in model_files:
        stem = f.stem
        try:
            num = int(stem.split("-")[1])
            generations.append((num, f))
        except (IndexError, ValueError):
            continue

    if not generations:
        return []

    generations.sort(key=lambda x: x[0])
    max_gen = generations[-1][0]
    pruned = []

    for num, f in generations:
        if f.name in protected_models:
            continue
        if num > max_gen - keep_recent:
            continue
        if keep_every > 0 and num % keep_every == 0:
            continue
        try:
            f.unlink()
            pruned.append(f.name)
        except OSError:
            pass

    return pruned

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=".selfplay/final-verification", help="Output directory")
    parser.add_argument("--minutes", type=float, default=30.0, help="Minutes per training run")
    parser.add_argument("--iterations", type=int, default=1000000, help="Additional iterations")
    parser.add_argument("--games", type=int, default=4, help="Games per iteration")
    parser.add_argument("--simulations", type=int, default=128, help="MCTS simulations")
    parser.add_argument("--steps", type=int, default=32, help="Train steps per iteration")
    parser.add_argument("--eval-pairs", type=int, default=2, help="Eval pairs per iteration")
    parser.add_argument("--keep-every", type=int, default=10, help="Keep checkpoints every N iterations")
    parser.add_argument("--keep-recent", type=int, default=5, help="Keep most recent N checkpoints")
    parser.add_argument("--protected", nargs="*", default=["model-00002.pt"], help="Protected checkpoint filenames")
    parser.add_argument("--adopt-pid", type=int, default=0, help="PID of already running training process to adopt")
    args = parser.parse_args()

    workdir = Path.cwd()
    output_dir = (workdir / args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    supervisor_pid_file = output_dir / "supervisor.pid"
    continuation_pid_file = output_dir / "continuation.pid"
    continuation_log_file = output_dir / "continuation.log"
    supervisor_log_file = output_dir / "supervisor.log"
    supervisor_status_file = output_dir / "supervisor.status"
    stop_flag_file = output_dir / "stop.flag"

    # Single supervisor lock
    supervisor_lock_file = output_dir / "supervisor.lock"
    lock_fp = supervisor_lock_file.open("w")
    try:
        fcntl.flock(lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("Another supervisor is already running for this directory.", file=sys.stderr)
        sys.exit(1)

    supervisor_pid_file.write_text(str(os.getpid()))

    stopping = False
    current_child = None

    def handle_signal(_signum, _frame):
        nonlocal stopping
        stopping = True
        log_event(supervisor_log_file, "signal_received", signum=_signum)
        if current_child and current_child.poll() is None:
            log_event(supervisor_log_file, "forwarding_sigint_to_child", child_pid=current_child.pid)
            try:
                current_child.send_signal(signal.SIGINT)
            except OSError:
                pass

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    log_event(supervisor_log_file, "supervisor_started", pid=os.getpid(), config=vars(args))
    supervisor_status_file.write_text("RUNNING\n")

    consecutive_failures = 0
    adopted_pid = args.adopt_pid

    if adopted_pid <= 0 and continuation_pid_file.exists():
        try:
            candidate = int(continuation_pid_file.read_text().strip())
            if is_pid_alive(candidate):
                adopted_pid = candidate
        except ValueError:
            pass

    try:
        # First: adopt existing running process if any
        if adopted_pid > 0 and is_pid_alive(adopted_pid):
            log_event(supervisor_log_file, "adopting_existing_process", pid=adopted_pid)
            while is_pid_alive(adopted_pid) and not stopping:
                if stop_flag_file.exists():
                    log_event(supervisor_log_file, "stop_flag_detected_during_adopt")
                    try:
                        os.kill(adopted_pid, signal.SIGINT)
                    except OSError:
                        pass
                    break
                time.sleep(5)
            log_event(supervisor_log_file, "adopted_process_finished", pid=adopted_pid)

        # Main supervision loop
        while not stopping:
            if stop_flag_file.exists():
                log_event(supervisor_log_file, "stop_flag_detected_exiting")
                supervisor_status_file.write_text("STOPPED_BY_FLAG\n")
                break

            try:
                free_mb = check_disk_space(output_dir)
            except RuntimeError as e:
                log_event(supervisor_log_file, "error_disk_space", error=str(e))
                supervisor_status_file.write_text("STOPPED_LOW_DISK\n")
                break

            # Prune old intermediate checkpoints
            pruned = prune_checkpoints(output_dir, args.keep_every, args.keep_recent, args.protected)
            if pruned:
                log_event(supervisor_log_file, "pruned_checkpoints", count=len(pruned), files=pruned)

            # Start training session
            python_bin = workdir / ".venv-selfplay" / "bin" / "python"
            train_script = workdir / "selfplay" / "train.py"
            cmd = [
                "nice", "-n", "10",
                str(python_bin), str(train_script), "train",
                "--output", str(output_dir),
                "--resume",
                "--iterations", str(args.iterations),
                "--games", str(args.games),
                "--simulations", str(args.simulations),
                "--steps", str(args.steps),
                "--eval-pairs", str(args.eval_pairs),
                "--minutes", str(args.minutes)
            ]

            log_event(supervisor_log_file, "launching_session", command=" ".join(cmd))
            with continuation_log_file.open("a", encoding="utf-8") as stdout_f:
                current_child = subprocess.Popen(
                    cmd,
                    stdout=stdout_f,
                    stderr=subprocess.STDOUT,
                    cwd=str(workdir)
                )

            continuation_pid_file.write_text(str(current_child.pid))
            log_event(supervisor_log_file, "session_running", child_pid=current_child.pid)

            # Wait for child
            while current_child.poll() is None:
                if stopping:
                    log_event(supervisor_log_file, "stopping_child_on_exit", child_pid=current_child.pid)
                    try:
                        current_child.send_signal(signal.SIGINT)
                    except OSError:
                        pass
                    current_child.wait(timeout=60)
                    break
                if stop_flag_file.exists():
                    log_event(supervisor_log_file, "stop_flag_detected_sending_sigint", child_pid=current_child.pid)
                    try:
                        current_child.send_signal(signal.SIGINT)
                    except OSError:
                        pass
                    current_child.wait(timeout=60)
                    stopping = True
                    supervisor_status_file.write_text("STOPPED_BY_FLAG\n")
                    break
                time.sleep(5)

            returncode = current_child.returncode
            log_event(supervisor_log_file, "session_ended", child_pid=current_child.pid, returncode=returncode)
            current_child = None

            if returncode == 0:
                consecutive_failures = 0
            else:
                consecutive_failures += 1
                log_event(supervisor_log_file, "session_failed", returncode=returncode, consecutive=consecutive_failures)
                if consecutive_failures >= 3:
                    log_event(supervisor_log_file, "halted_repeated_failures", count=consecutive_failures)
                    supervisor_status_file.write_text("STOPPED_REPEATED_FAILURES\n")
                    break
                time.sleep(10)

            # Cooldown check before next session
            time.sleep(2)

    finally:
        if supervisor_pid_file.exists():
            supervisor_pid_file.unlink(missing_ok=True)
        if current_child and current_child.poll() is None:
            try:
                current_child.send_signal(signal.SIGINT)
                current_child.wait(timeout=30)
            except (OSError, subprocess.TimeoutExpired):
                pass
        log_event(supervisor_log_file, "supervisor_shutdown")
        fcntl.flock(lock_fp, fcntl.LOCK_UN)
        lock_fp.close()

if __name__ == "__main__":
    main()
