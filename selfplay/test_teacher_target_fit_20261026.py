"""Analytic fixtures for estimands, legal masking and the fixed mechanism gate."""
import copy
import math
import unittest

import torch

from fit_teacher_targets_20261026 import equal_state, gate, metrics


class FitTests(unittest.TestCase):
    def test_masked_metrics_keep_two_value_estimands(self):
        class Fixed:
            def __call__(self,x):
                return torch.tensor([[0.,100.,0.]]*len(x)),torch.tensor([.5]*len(x))
        rows=[dict(x=[0.],mask=[True,False,True],teacher_action=2,
                   factual_z=-1.,teacher_z=1.,stage=stage,seed=10) for stage in (5,13,21)]
        measured=metrics(Fixed(),rows)['overall']
        self.assertAlmostEqual(measured['teacher_ce'],math.log(2),places=6)
        self.assertEqual(measured['top1'],0)
        self.assertEqual(measured['factual_mse'],2.25)
        self.assertEqual(measured['teacher_mse'],.25)

    def test_gate_cannot_hide_stage_or_policy_failure(self):
        baseline=dict(teacher_ce=3.,top1=.2,teacher_mse=1.,factual_mse=0.)
        control=dict(overall=baseline,stages={str(s):dict(baseline) for s in (5,13,21)})
        candidate=copy.deepcopy(control)
        for subset in [candidate['overall'],*candidate['stages'].values()]:
            subset['teacher_mse']=.9
            subset['factual_mse']=5.
        self.assertTrue(gate(control,candidate)['passed'])
        candidate['stages']['13']['teacher_mse']=1.
        self.assertFalse(gate(control,candidate)['passed'])
        candidate['stages']['13']['teacher_mse']=.9
        candidate['stages']['21']['teacher_ce']=3.01
        self.assertFalse(gate(control,candidate)['passed'])
        candidate['stages']['21']['teacher_ce']=3.
        candidate['overall']['top1']=.19
        self.assertFalse(gate(control,candidate)['passed'])

    def test_optimizer_tensor_state_equality(self):
        state=dict(param_groups=[dict(lr=.001,params=[0])],state={0:dict(step=torch.tensor(42.),exp_avg=torch.tensor([.1,.2]))})
        copied=copy.deepcopy(state)
        self.assertTrue(equal_state(state,copied))
        copied['state'][0]['exp_avg'][1]=.3
        self.assertFalse(equal_state(state,copied))


if __name__=='__main__':
    unittest.main()
