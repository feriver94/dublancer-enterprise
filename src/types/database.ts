export type MoneyInput={amountMinor:bigint;currency:string};
export function normalizePageSize(take=25){return Math.min(Math.max(take,1),100);}
