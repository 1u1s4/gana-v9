import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(process.argv[2]); const target = process.argv[3]; const date = process.argv[4];
const url = new URL(target);
if (url.hostname !== '127.0.0.1' || !/^\/gana_study_[a-z0-9_]+$/.test(url.pathname) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Target must be a dedicated local study database');
if (target === process.env.DATABASE_URL) throw new Error('Source and target must differ');
const source = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL }); const local = new PrismaClient({ datasourceUrl: target });
try {
  const from = new Date(`${date}T00:00:00Z`); const to = new Date(from);to.setUTCDate(to.getUTCDate()+2);
  const [providers, fixtures, presets] = await Promise.all([source.sportsProvider.findMany({where:{code:'api-football'}}),source.fixture.findMany({where:{scheduledAt:{gte:from,lt:to}}}),source.teamPreset.findMany()]);
  const teamIds=[...new Set([...fixtures.flatMap(x=>[x.homeTeamId,x.awayTeamId]),...presets.map(x=>x.teamId)].filter(Boolean))];
  const competitionIds=[...new Set(fixtures.map(x=>x.competitionId).filter(Boolean))];
  const [teams,competitions]=await Promise.all([source.team.findMany({where:{id:{in:teamIds}}}),source.competition.findMany({where:{id:{in:competitionIds}}})]);
  const seed={sportsProvider:providers,competition:competitions,team:teams,fixture:fixtures,teamPreset:presets};
  mkdirSync(root,{recursive:true});writeFileSync(resolve(root,'normalized-seed.json'),JSON.stringify(seed));
  for(const [model,rows] of Object.entries(seed))if(rows.length)await local[model].createMany({data:rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key,value])=>!(key==='metadata'&&value===null)))),skipDuplicates:true});
  console.log(JSON.stringify(Object.fromEntries(Object.entries(seed).map(([key,rows])=>[key,rows.length]))));
}finally{await source.$disconnect();await local.$disconnect();}
