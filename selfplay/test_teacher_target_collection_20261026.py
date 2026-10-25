"""Collection control tests use fake calls; no teacher judgments or fitting."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import collect_teacher_targets_20261026 as c


class State:
    def __init__(self):
        self.data = {'step': 0}

    def legal_actions(self):
        return [12]

    def apply_action(self, action):
        assert action == 12
        self.data['step'] += 1
        if self.is_terminal():
            self.data['players'] = [{'score': 1}, {'score': 2}]

    def is_terminal(self):
        return self.data['step'] == 2

    def returns(self):
        return [-1, 1]


class Probe:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def call(self, request):
        return dict(action=12, diagnostics=dict(completedBeliefSamples=64, usedForcedWinContinuation=False), proofs=[])


class CollectionTests(unittest.TestCase):
    def test_source_order_split_duplicate_and_insufficiency(self):
        events = [dict(event='selfplay', opponent='baseline', total_games=15603+4*i,
                       match=dict(seed=100+i, model_seat=i%2, actions=[12]*31, returns=[-1,1])) for i in range(32)]
        sources, screening = c.choose_sources(events)
        self.assertEqual(sources, events)
        self.assertEqual(len(screening), 32)
        descriptors = list(c.descriptors(dict(source=sources)))
        self.assertEqual(len(descriptors), 192)
        self.assertEqual([sum(d['group']==g for d in descriptors) for g in ('update','selection','confirmation')], [96,48,48])
        with self.assertRaises(ValueError):
            c.choose_sources(events[:31])
        invalid = copy.deepcopy(events)
        invalid[1]['match']['seed'] = 100
        with self.assertRaises(AssertionError):
            c.choose_sources(invalid)
        invalid = copy.deepcopy(events)
        invalid[0]['match']['actions'] = []
        with self.assertRaises(AssertionError):
            c.choose_sources(invalid)

    def test_dual_deadline(self):
        with patch.object(c.time, 'time', return_value=100), patch.object(c.time, 'monotonic', return_value=200):
            deadline=c.Deadline(10)
        for wall, mono in ((110,201),(101,210)):
            with patch.object(c.time,'time',return_value=wall), patch.object(c.time,'monotonic',return_value=mono):
                with self.assertRaises(TimeoutError):
                    deadline.remaining()

    def test_root_completion_timeout_and_null_failure(self):
        source = dict(match=dict(model_seat=0, returns=[-1,1]))
        desc = dict(id='00-05-0', seed=100, stage=5, mirror=False)
        with tempfile.TemporaryDirectory() as directory, patch.object(c,'DiagnosticProbe',return_value=Probe()), patch.object(c,'card_check'):
            path=Path(directory)/'row.json'
            def root(*_):
                return State(),0,[12]*5,[0],[True]
            with patch.object(c,'root_for',side_effect=root):
                row=c.collect_root(None,Probe(),source,desc,c.Deadline(),path)
                self.assertTrue(row['complete'])
                self.assertEqual(row['teacher_z'],-1)
                self.assertEqual(len(row['null']),3)
                self.assertEqual([d['request']['seed'] for d in row['decisions']],[(100 ^ 0x102687)+5,(100 ^ 0x102687)+6])
                class TimeoutProbe(Probe):
                    def call(self, request):
                        raise TimeoutError('owned child deadline')
                with self.assertRaises(TimeoutError):
                    c.collect_root(None,TimeoutProbe(),source,desc,c.Deadline(),path)
                partial=json.loads(path.read_text())
                self.assertFalse(partial['complete'])
                self.assertFalse(partial['active_call']['complete'])
                self.assertEqual(partial['failure']['type'],'TimeoutError')
                class BadProbe(Probe):
                    def call(self, request):
                        reply=super().call(request)
                        reply['diagnostics']['completedBeliefSamples']=63
                        return reply
                with self.assertRaises(AssertionError):
                    c.collect_root(None,BadProbe(),source,desc,c.Deadline(),path)
                self.assertFalse(json.loads(path.read_text())['complete'])
                class DisagreeProbe(Probe):
                    counter=0
                    def call(self, request):
                        self.counter+=1
                        reply=super().call(request)
                        reply['action']=12 if self.counter==1 else 13
                        return reply
                with patch.object(c,'validate_reply'),self.assertRaisesRegex(AssertionError,'null disagreement'):
                    c.collect_root(None,DisagreeProbe(),source,desc,c.Deadline(),path)
                self.assertFalse(json.loads(path.read_text())['complete'])

    def test_resume_rejects_mutated_inputs(self):
        plan=json.loads(c.PLAN_PATH.read_text())
        frozen=plan['source_rule']['frozen_checkpoint_sha256']
        manifest=dict(plan_sha256='p',frozen_sha256=frozen,rules_sha256='r',collector_sha256='c',
                      probe_sha256='d',teacher_sha256='t',generated_hashes={'ai':'g'},
                      source=[{'match':{'seed':100}}], forbidden={'files':[],'seeds':[200]})
        manifest['source_sha256']=c.digest(manifest['source'])
        manifest['forbidden_sha256']=c.digest(manifest['forbidden'])
        manifest['signature']=c.signature(manifest)
        def fake_sha(path):
            name=path.name
            return {'gto_teacher_target_plan_20261026.json':'p','checkpoint.pt':frozen,
                    'collect_teacher_targets_20261026.py':'c','diagnostic_probe.py':'d',
                    'audit_bounded_a9_20261025.ts':'t'}[name]
        with patch.object(c,'sha',side_effect=fake_sha),patch.object(c,'rules_digest',return_value='r'),patch.object(c,'generated_hashes',return_value={'ai':'g'}):
            c.validate_resume(manifest)
            for key in ('plan_sha256','frozen_sha256','source_sha256','signature'):
                with self.assertRaises(AssertionError):
                    c.validate_resume(dict(manifest,**{key:'changed'}))
            modified=copy.deepcopy(manifest)
            modified['source'][0]['match']['seed']=200
            with self.assertRaises(AssertionError):
                c.validate_resume(modified)

    def test_atomic_save_and_signature_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'manifest.json'
            c.save(path,dict(complete=False))
            c.save(path,dict(complete=True))
            self.assertTrue(json.loads(path.read_text())['complete'])
            self.assertFalse(path.with_suffix('.json.tmp').exists())
        keys=('plan_sha256','frozen_sha256','rules_sha256','collector_sha256','probe_sha256','teacher_sha256','generated_hashes','source_sha256','forbidden_sha256')
        manifest=dict.fromkeys(keys,'a')
        initial=c.signature(manifest)
        for key in keys:
            changed=dict(manifest,**{key:'b'})
            self.assertNotEqual(initial,c.signature(changed))


if __name__=='__main__':
    unittest.main()
