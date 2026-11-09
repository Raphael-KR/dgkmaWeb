import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db';
import { sourceCollectionRules } from '@shared/schema';
import { collectionRuleSchema, type RuleStore } from '../../integrations/public-sources/collection-contract';

export const collectionRuleStore:RuleStore={
  async find(domain) {
    const rows=await db.select().from(sourceCollectionRules).where(eq(sourceCollectionRules.domain,domain)).orderBy(desc(sourceCollectionRules.lastSuccessAt)).limit(20);
    return rows.flatMap(row=>{const p=collectionRuleSchema.safeParse(row.rule);return p.success&&p.data.domain===row.domain&&p.data.pagePattern===row.pagePattern?[{id:row.id,version:row.version,rule:p.data}]:[];});
  },
  async succeeded(id) {await db.update(sourceCollectionRules).set({lastSuccessAt:new Date()}).where(eq(sourceCollectionRules.id,id));},
  async save(candidate) {
    const rule=collectionRuleSchema.parse(candidate);
    const [row]=await db.insert(sourceCollectionRules).values({domain:rule.domain,pagePattern:rule.pagePattern,rule,lastSuccessAt:new Date()}).onConflictDoUpdate({target:[sourceCollectionRules.domain,sourceCollectionRules.pagePattern],set:{rule,version:sql`${sourceCollectionRules.version}+1`,updatedAt:new Date(),lastSuccessAt:new Date()}}).returning({id:sourceCollectionRules.id,version:sourceCollectionRules.version});
    return row;
  },
};
