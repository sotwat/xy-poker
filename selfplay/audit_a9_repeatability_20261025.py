"""Fresh/reused-process A9 null controls with real versus frozen decision clock."""
import json
import selectors
import subprocess
import time
from pathlib import Path

from environment import Bridge
from train import paired_state

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'gto_a9_repeatability_20261025.json'


class Probe:
    def __enter__(self):
        self.p = subprocess.Popen(['node', '--import', 'tsx', 'scripts/audit_a9_repeatability_20261025.ts'],
                                  cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.p.stdout, selectors.EVENT_READ)
        return self

    def call(self, request):
        self.p.stdin.write(json.dumps(request)+'\n')
        self.p.stdin.flush()
        if not self.selector.select(timeout=90):
            raise TimeoutError('Probe exceeded 90 seconds')
        reply = json.loads(self.p.stdout.readline())
        if 'error' in reply:
            raise RuntimeError(reply['error'])
        return reply

    def __exit__(self, *_):
        self.p.terminate()
        self.p.wait(timeout=5)
        self.p.stdin.close()
        self.p.stdout.close()
        self.selector.close()


def run():
    deadline = time.monotonic()+1200
    source = json.loads((ROOT/'gto_recovery_curve_20261025.json').read_text())
    cases = []
    with Bridge() as bridge:
        for old in source['rows']:
            if old['cutoff'] != 0:
                continue
            one = next(r for r in source['rows'] if r['seed']==old['seed'] and r['mirror']==old['mirror'] and r['cutoff']==1)
            divergence = next((k+1 for k,(a,b) in enumerate(zip(old['moves'][1:],one['moves'])) if a != b),None)
            if divergence is None:
                continue
            state = paired_state(bridge,old['seed'],old['swap'])
            for a in old['moves'][:divergence]:
                state.apply_action(a)
            cases.append(dict(group=old['group'], seed=old['seed'], mirror=old['mirror'],
                              action_index=divergence, state=state.data,
                              decision_seed=old['continuation_seeds'][divergence],
                              previous_actions=[old['moves'][divergence],one['moves'][divergence-1]]))
    assert len(cases)==5
    result = dict(complete=False,cases=cases,rows=[],plan=dict(repetitions=3, samples=64,
                  milliseconds=1000, clocks=['timed','frozen'], histories=['fresh','reuse'],
                  scope='Post hoc null-control divergence states; mechanism diagnosis, not strength comparison'))
    OUT.write_text(json.dumps(result,indent=2)+'\n')
    for clock in ('timed','frozen'):
        for case in cases:
            request=dict(state=case['state'],seed=case['decision_seed'],frozenClock=clock=='frozen')
            for history in ('fresh','reuse'):
                def record(probe,repetition):
                    if time.monotonic()>deadline:
                        raise TimeoutError('Diagnostic deadline reached')
                    reply=probe.call(request)
                    result['rows'].append(dict(group=case['group'],seed=case['seed'],mirror=case['mirror'],
                                               clock=clock,history=history,repetition=repetition,**reply))
                    OUT.write_text(json.dumps(result,indent=2)+'\n')
                    print(json.dumps(result['rows'][-1]),flush=True)
                if history=='fresh':
                    for repetition in range(3):
                        with Probe() as probe:record(probe,repetition)
                else:
                    with Probe() as probe:
                        for repetition in range(3):record(probe,repetition)
    result['complete']=True
    OUT.write_text(json.dumps(result,indent=2)+'\n')


if __name__=='__main__':run()
