import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const members=[["Asif Baloch","Owner","Executive","MFA Enabled","Active"],["Product Lead","Admin","Product","MFA Enabled","Active"],["Engineering Lead","Admin","Engineering","MFA Enabled","Active"],["AI Architect","Manager","AI","MFA Enabled","Active"],["Finance Lead","Finance","Finance","Pending","Review"],["Client Viewer","Guest","External","Limited","Active"]];
export default function MemberDirectory(){
 return <Card variant="elevated" style={{padding:34}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}><div><Badge variant="info">Members</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Enterprise identity directory</h2></div><Button variant="primary">Invite User</Button></div>
  <div style={{display:"grid",gap:12}}>{members.map(([n,r,d,m,s])=><div key={n} style={{display:"grid",gridTemplateColumns:"46px 1fr 120px 130px 130px 100px",gap:14,alignItems:"center",padding:14,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}>
   <div style={{width:46,height:46,borderRadius:"999px",display:"grid",placeItems:"center",background:"rgba(0,154,68,.12)",color:brand.colors.green,fontWeight:brand.typography.weight.bold}}>{n[0]}</div><strong style={{color:brand.colors.navy}}>{n}</strong><Badge variant={r==="Owner"?"success":"info"}>{r}</Badge><span style={{color:brand.colors.muted}}>{d}</span><Badge variant={m==="MFA Enabled"?"success":"neutral"}>{m}</Badge><Badge variant={s==="Review"?"info":"success"}>{s}</Badge></div>)}</div>
 </Card>
}
