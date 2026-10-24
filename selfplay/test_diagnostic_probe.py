"""Controlled pauses, partial output and deadlines for owned probe children."""
import json
import os
import signal
import threading
import time
from unittest.mock import patch
from diagnostic_probe import DiagnosticProbe

CHILD=r'''
process.stdin.once('data', data => {
 const request=JSON.parse(data), start=process.hrtime.bigint(), wall=Date.now(), cpu=process.cpuUsage();
 if(request.stop)process.kill(process.pid,'SIGSTOP');
 const until=process.hrtime.bigint()+100000000n;
 while(process.hrtime.bigint()<until){}
 const used=process.cpuUsage(cpu);
 process.stdout.write(JSON.stringify({actualElapsedMs:Number(process.hrtime.bigint()-start)/1e6,
  wallElapsedMs:Date.now()-wall,cpuMs:(used.user+used.system)/1000})+'\n');
});
'''

def run():
 rows=[]
 with DiagnosticProbe(['node','-e',CHILD],timeout=3) as probe:
  plain=probe.call({});rows.append(dict(kind='busy',**plain))
 with DiagnosticProbe(['node','-e',CHILD],timeout=3) as probe:
  timer=threading.Timer(.7,lambda:os.kill(probe.p.pid,signal.SIGCONT));timer.start()
  try:paused=probe.call({'stop':True})
  finally:timer.join()
  rows.append(dict(kind='pause_then_busy',**paused))
 assert paused['actualElapsedMs']>500 and paused['cpuMs']<paused['actualElapsedMs']*.7
 pid=None
 try:
  with DiagnosticProbe(['node','-e',CHILD],timeout=.3) as probe:
   pid=probe.p.pid;probe.call({'stop':True})
 except TimeoutError:rows.append(dict(kind='stopped_child_timeout',reaped=probe.p.poll() is not None))
 else:raise AssertionError('Stopped child accepted')
 assert probe.p.poll() is not None
 with DiagnosticProbe(['node','-e',"process.stdin.once('data',()=>{process.stdout.write('{');setTimeout(()=>{},10000);});"],timeout=.3) as probe:
  try:probe.call({})
  except TimeoutError:rows.append(dict(kind='partial_line_timeout',passed=True))
  else:raise AssertionError('Partial line blocked timeout')
 with DiagnosticProbe(['node','-e',"process.stdin.once('data',()=>process.stdout.write('{}\\n'));"],timeout=3) as probe:
  # The jump is injected after select; the host clock stays unchanged.
  times=iter([100,100,104])
  with patch('diagnostic_probe.time.time',side_effect=lambda:next(times)), patch.object(probe.selector,'select',return_value=[]):
   try:probe.call({})
   except TimeoutError:rows.append(dict(kind='wall_jump_after_wait',passed=True))
   else:raise AssertionError('Wall-clock jump accepted')
 print(json.dumps(rows,indent=2))
 return rows

if __name__=='__main__':run()
