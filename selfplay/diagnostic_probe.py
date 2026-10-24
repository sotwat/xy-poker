"""Owned diagnostic subprocess transport with absolute wall-time rejection."""
import json
import os
import selectors
import subprocess
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class DiagnosticProbe:
    def __init__(self, command=None, timeout=90):
        self.command=command or ['node','--import','tsx','scripts/audit_a9_repeatability_20261025.ts']
        self.timeout=timeout

    def __enter__(self):
        self.p=subprocess.Popen(self.command,cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
        os.set_blocking(self.p.stdout.fileno(),False)
        self.selector=selectors.DefaultSelector();self.selector.register(self.p.stdout,selectors.EVENT_READ)
        self.buffer=b''
        return self

    def call(self,request):
        started=time.time();deadline=started+self.timeout
        monotonic_started=time.monotonic();monotonic_deadline=monotonic_started+self.timeout
        self.p.stdin.write((json.dumps(request)+'\n').encode());self.p.stdin.flush()
        while True:
            remaining=min(deadline-time.time(),monotonic_deadline-time.monotonic())
            if remaining<=0:raise TimeoutError('Diagnostic absolute wall deadline exceeded')
            events=self.selector.select(min(.25,remaining))
            if time.time()>deadline or time.monotonic()>monotonic_deadline:raise TimeoutError('Diagnostic absolute wall deadline exceeded after wait')
            if not events:continue
            chunk=os.read(self.p.stdout.fileno(),65536)
            if not chunk:raise RuntimeError('Diagnostic process closed output')
            self.buffer+=chunk
            if len(self.buffer)>1_048_576:raise RuntimeError('Diagnostic response exceeded size limit')
            if b'\n' not in self.buffer:continue
            line,self.buffer=self.buffer.split(b'\n',1)
            reply=json.loads(line)
            if 'error' in reply:raise RuntimeError(reply['error'])
            reply['parentWallElapsedMs']=(time.time()-started)*1000
            reply['parentMonotonicElapsedMs']=(time.monotonic()-monotonic_started)*1000
            if reply.get('actualElapsedMs',0)>self.timeout*1000:raise TimeoutError('Child elapsed budget exceeded')
            return reply

    def __exit__(self,*_):
        if self.p.poll() is None:self.p.kill()
        self.p.wait(timeout=5)
        self.selector.close();self.p.stdin.close();self.p.stdout.close()
