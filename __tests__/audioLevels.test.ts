import { describe, it, expect } from '@jest/globals';
/* eslint-disable @typescript-eslint/no-require-imports */
const { parseLoudnormJson, userTrackFilter } = require('../server/audioLevels');
/* eslint-enable @typescript-eslint/no-require-imports */

const STDERR = `[Parsed_loudnorm_1 @ 0x1] 
{
	"input_i" : "-37.05",
	"input_tp" : "-8.41",
	"input_lra" : "14.20",
	"input_thresh" : "-47.68",
	"output_i" : "-16.32",
	"output_tp" : "-1.50",
	"output_lra" : "9.10",
	"output_thresh" : "-26.90",
	"normalization_type" : "dynamic",
	"target_offset" : "0.32"
}
size=N/A time=00:00:44.03`;

describe('parseLoudnormJson', () => {
  it('lee la medición que imprime loudnorm', () => {
    expect(parseLoudnormJson(STDERR)).toEqual({ I: -37.05, TP: -8.41, LRA: 14.2, thresh: -47.68, offset: 0.32 });
  });
  it('una toma en silencio (-inf) o una salida sin JSON no da medición', () => {
    expect(parseLoudnormJson(STDERR.replace('"-37.05"', '"-inf"'))).toBeNull();
    expect(parseLoudnormJson('nada')).toBeNull();
  });
});

describe('userTrackFilter', () => {
  it('con medición aplica ganancia fija (linear=true) con LRA 20', () => {
    const f = userTrackFilter('highpass=f=80', { I: -37.05, TP: -8.41, LRA: 14.2, thresh: -47.68, offset: 0.32 });
    expect(f).toBe('highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=20:measured_I=-37.05:measured_TP=-8.41:measured_LRA=14.2:measured_thresh=-47.68:offset=0.32:linear=true');
  });
  it('sin medición vuelve al loudnorm normal', () => {
    expect(userTrackFilter('highpass=f=80', null)).toBe('highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=20');
  });
});

describe('aiMuteExpression', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { aiMuteExpression } = require('../server/audioLevels');
  /* eslint-enable @typescript-eslint/no-require-imports */
  it('silencia cada réplica con 0,15 s antes y 0,4 s después (cubre la cola de la IA)', () => {
    expect(aiMuteExpression([{ startTime: 9.6, duration: 3.9 }, { startTime: 0.1, duration: 2 }]))
      .toBe('if(gte(between(t,9.450,13.900)+between(t,0.000,2.500),1),0,1)');
  });
  it('sin réplicas no hay nada que silenciar', () => {
    expect(aiMuteExpression([])).toBeNull();
  });
});
