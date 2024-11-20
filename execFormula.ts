import sampleInput from './formulas/simpleFormula.json' with { type: "json" };
import { executeFormula } from './workflow.ts';

const runFormula = async () => {
    const result = await executeFormula(sampleInput);
    console.log(result);
}

runFormula();