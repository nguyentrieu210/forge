import assert from "node:assert/strict";
import test from "node:test";

import { qualitySamplingRequirement } from "../dist/packages/clouderp-erpnext/src/qms-sampling.js";

function plan(method, extra={}) { return { company:"ACME",plan_name:"P",inspection_type:"Incoming",effective_from:"2026-08-01",sampling_method:method,parameters:[{row_id:"R",specification:"X",parameter_type:"Pass/Fail"}],...extra }; }

test("100 percent sampling requires the full lot",()=>{const result=qualitySamplingRequirement(plan("100%"),37);assert.equal(result.required_sample_size,37);assert.equal(result.capped_to_lot,false);});

test("fixed sampling uses configured count and caps it to a smaller lot",()=>{assert.equal(qualitySamplingRequirement(plan("Fixed",{sample_size:5}),100).required_sample_size,5);const capped=qualitySamplingRequirement(plan("Fixed",{sample_size:5}),3);assert.equal(capped.required_sample_size,3);assert.equal(capped.capped_to_lot,true);});

test("percentage sampling rounds upward so a fractional sample never under-samples",()=>{const result=qualitySamplingRequirement(plan("Percentage",{sample_percentage:"12.5"}),9);assert.equal(result.required_sample_size,2);assert.equal(result.sample_percentage,"12.5");});

test("percentage sampling stays bounded by the lot",()=>{const result=qualitySamplingRequirement(plan("Percentage",{sample_percentage:"100"}),1);assert.equal(result.required_sample_size,1);assert.equal(result.capped_to_lot,false);});

test("sampling rejects zero lot size and invalid percentage",()=>{assert.throws(()=>qualitySamplingRequirement(plan("100%"),0),/positive integer/);assert.throws(()=>qualitySamplingRequirement(plan("Percentage",{sample_percentage:"101"}),10),/> 0 and <= 100/);});
