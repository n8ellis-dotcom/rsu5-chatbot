import Anthropic from '@anthropic-ai/sdk';
import { findRelevantChunks } from '@/lib/search';

export const maxDuration = 60;

const DEEPER_INDICATORS = [
    'tell me more', 'elaborate', 'explain more', 'dig deeper', 'more detail',
    'expand on', 'can you explain', 'what do you mean', 'go deeper',
    'more about', 'further', 'in depth', 'deeper dive', 'try harder',
    'more thorough', 'be more specific', 'give me more', 'not enough',
    'too vague', 'more complete', 'full answer', 'complete answer',
    'more comprehensive', 'flesh out', 'more context', 'more information'
  ];

function selectModel(query: string): string {
    const q = query.toLowerCase();
    if (DEEPER_INDICATORS.some(p => q.includes(p))) return 'claude-sonnet-4-5';
    return 'claude-haiku-4-5-20251001';
}

function extractTimestamp(chunk: string): number | null {
    const match = chunk.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
    if (!match) return null;
    const h = match[3] ? parseInt(match[1]) : 0;
    const m = match[3] ? parseInt(match[2]) : parseInt(match[1]);
    const s = match[3] ? parseInt(match[3]) : parseInt(match[2]);
    return match[3] ? h * 3600 + m * 60 + s : m * 60 + s;
}

function formatTime(seconds: number | null): string {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSource(filepath: string, sourceUrl?: string | null, chunk?: string): string {
    const filename = filepath.split('/').pop() || filepath;
    const transcriptMatch = filename.match(/transcript_(\d{4}-\d{2}-\d{2})_([^_]+)/);
    if (transcriptMatch) {
          const date = transcriptMatch[1];
          const videoId = transcriptMatch[2].replace('_part1', '').replace('_part2', '').replace('.txt', '');
          const baseUrl = sourceUrl || `https://youtube.com/watch?v=${videoId}`;
          const seconds = chunk ? extractTimestamp(chunk) : null;
          const url = seconds ? `${baseUrl}&t=${seconds}` : baseUrl;
          const timeLabel = seconds ? ` ~${formatTime(seconds)}` : '';
          return `RSU5 Board Meeting Transcript - ${date} ([Watch video${timeLabel}](${url}))`;
    }
    const boardMatch = filename.match(/(\d{4}-\d{2}-\d{2})_RSU5_Board_Meeting/);
    if (boardMatch) {
          const date = boardMatch[1];
          const baseUrl = sourceUrl || `https://www.youtube.com/@rsu5livestream524`;
          const seconds = chunk ? extractTimestamp(chunk) : null;
          const url = seconds ? `${baseUrl}&t=${seconds}` : baseUrl;
          const timeLabel = seconds ? ` ~${formatTime(seconds)}` : '';
          return `RSU5 Board Meeting Transcript - ${date} ([Watch video${timeLabel}](${url}))`;
    }
    if (filename.includes('RSU5_Meeting_3_18_26')) {
          const seconds = chunk ? extractTimestamp(chunk) : null;
          const baseUrl = `https://youtube.com/watch?v=5vc4AdOr5oM`;
          const url = seconds ? `${baseUrl}&t=${seconds}` : baseUrl;
          const timeLabel = seconds ? ` ~${formatTime(seconds)}` : '';
          return `RSU5 Board Meeting Transcript - 2026-03-18 ([Watch video${timeLabel}](${url}))`;
    }
    if (sourceUrl) {
          return `${filename.replace(/_/g, ' ').replace('.txt', '')} ([Source](${sourceUrl}))`;
    }
    return filename.replace(/_/g, ' ').replace('.txt', '');
}

function extractNameFromQuery(query: string): string | null {
    const fullName = query.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
    if (fullName) return fullName[0];
    const skipWords = ['RSU5','Maine','Freeport','Durham','Pownal','Monday','Tuesday',
                           'Wednesday','Thursday','Friday','January','February','March','April','May','June',
                           'July','August','September','October','November','December'];
    const singleName = query.match(/\b([A-Z][a-z]{2,})\b/g);
    if (singleName) {
          const name = singleName.find(n => !skipWords.includes(n));
          if (name) return name;
    }
    return null;
}

export async function POST(req: Request) {
    const { messages } = await req.json();
    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'user')?.content ?? '';

  const adminMatch = lastUserMessage.match(/^admin:\s*(.+)$/i);
    const isAdmin = adminMatch !== null;
    const actualQuery = isAdmin ? adminMatch[1] : lastUserMessage;

  const model = selectModel(actualQuery);
    const chunkLimit = model === 'claude-sonnet-4-5' ? 6 : 5;

  const relevantChunks = await findRelevantChunks(actualQuery, chunkLimit);

  const detectedName = extractNameFromQuery(actualQuery);
    const stiamfpfoCrhtu nAknst h=r odpeitce cftreodmN a'm@ea
      n t h r o?p iacw-aaiit/ sfdikn'd;R
      eilmepvoarntt C{h ufniknsd(R`e$l{edveatnetcCtheudnNkasm e}}  fRrSoUm5  's@t/alfifb /dsieraercctho'r;y
      `
                                 ,e x2p)o
                      r t   c o:n s[t] ;m
                      a x Dcuornastti oanl l=C h6u0n;k
                      s
                       c=o n[s.t. .DrEeElPeEvRa_nItNCDhIuCnAkTsO]R;S
                        =  f[o
                         r   ('ctoenlslt  msec  moofr es't,a f'feClhaubnokrsa)t e{'
                      ,   ' e xipfl a(i!na lmloCrheu'n,k s'.dfiign dd(ece p=e>r 'c,. c'hmuonrke  =d=e=t asicl.'c,h
                      u n k')e)x p{a
                        n d   o n ' ,a l'lcCahnu nykosu. peuxsphl(asicn)';,
                          ' w h a}t
                          d o} 
y
  o u  cmoenasnt' ,c o'ngtoe xdte e=p earl'l,C
    h u n'kmso.rlee nagbtohu t>' ,0 
' f u r t?h earl'l,C h'uinnk sd.empatph('(,c )' d=e>e p{e
  r   d i v e ' ,  c'otnrsyt  hmaertdae r=' ,[

    ' m o r e   t h ocr.oduogch_'t,y p'eb e?  m`oTrYeP Es:p e$c{icf.idco'c,_ t'ygpiev}e`  m:e  'm'o,r
      e ' ,   ' n o t   e nco.udgohc'_,d
      a t e' t?o o` DvAaTgEu:e '$,{ c'.mdoorce_ dcaotmep}l`e t:e '',' ,'
      f u l l   a n s w e rc'.,s c'hcooomlp l e t?e  `aSnCsHwOeOrL':, 
  $ { c'.msocrheo oclo}m`p r:e h'e'n,s
  i v e ' ,   ' f l]e.sfhi lotuetr'(,B o'omloeraen )c.ojnotienx(t'' ,|  ''m)o;r
  e   i n f o r m arteitounr'n
   ]`;[
   S
   ofuurnccet:i o$n{ fsoerlmeacttSMooudrecle((qcu.efriyl:e psattrhi,n gc).:s osutrrcien_gu r{l
   ,   cc.ocnhsutn kq) }=$ {qmueetray .?t o`L o|w e$r{Cmaestea(})`; 
   :   'i'f} ](\DnE$E{PcE.Rc_hIuNnDkI}C`A;T
                                                      O R S . s o m}e)(.pj o=i>n (q'.\inn\cnl-u-d-e\sn(\pn)')))
       r e t u:r n' N'oc lraeuldeev-asnotn ndeotc-u4m-e5n't;s
           f oruentdu.r'n; 
         '
         c l acuodnes-th acilkiue-n4t- 5=- 2n0e2w5 1A0n0t1h'r;o
           p}i
c
(f{u nacptiiKoeny :e xptrroaccetsTsi.meensvt.aAmNpT(HcRhOuPnIkC:_ AsPtIr_iKnEgY) :} )n;u
m
b e rc o|n sntu lsly s{t
                       e m Pcroonmsptt  m=a t`cYho u=  acrheu ntkh.em aRtScUh5( /C\o[m(m\udn{i1t,y2 }I)n:f(o\rdm{a2t}i)o(n? :A:s(s\ids{t2a}n)t) ?-\ ]a/ )n;e
                       u t riafl ,( !fmaacttcuha)l  rreetsuorunr cneu lflo;r
                         t hceo nRsetg iho n=a lm aStcchho[o3l]  U?n ipta r5s ecIonmtm(umnaittcyh [i1n] )F r:e e0p;o
                         r t ,c oDnusrth amm ,=  amnadt cPho[w3n]a l?,  pMaarisneeI.n
                         tY(omua tacnhs[w2e]r)  q:u epsatrisoenIsn ta(bmoauttc hR[S1U]5) ;b
                         o a rcdo nmsete tsi n=g sm,a tbcuhd[g3e]t s?,  ppaorlsiecIinets(,m astcchho[o3l] )c a:l epnadrasresI,n ta(nmda tdcihs[t2r]i)c;t
                           d erceitsuironn sm autscihn[g3 ]o n?l yh  t*h e3 6o0f0f i+c ima l*  R6S0U 5+  dso c:u mme n*t s6 0p r+o vsi;d
                           e}d

                            bfeulnocwt.i
                            o
                            nK NfOoWrNm aRtSTUi5m eF(AsCeTcSo n(dasl:w anyusm baecrc u|r antuel,l )d:o  sntorti ncgo n{t
                            r a diifc t()!:s
                            e-c oSnudpse)r irnetteunrdne n't':; 
                            T o mc oGnrsaty  h( g=r aMyatt@hr.sful5o.oorr(gs)e
                            c-o nDdiss t/r i3c6t0:0 )R;e
                            g i ocnoanls tS cmh o=o lM aUtnhi.tf l5o,o rs(e(rsveicnogn dFsr e%e p3o6r0t0,)  D/u r6h0a)m;,
                              a ncdo nPsotw nsa l=,  sMeacionned
                              s
                               G%u i6d0e;l
                               i n eisf: 
                               (-h  B>e  0a)c cruertautren  a`n$d{ hc}i:t$e{ Sytoruirn gs(omu)r.cpeasd Sbtya rmte(n2t,i o'n0i'n)g} :t$h{eS tdroicnugm(esn)t. poard Smteaertti(n2g,  d'a0t'e)
                                                                                                                                        }-` ;A
                                                                                                                                        l w aryest uirnnc l`u$d{em }t:h$e{ Sstoruirncge( sl)i.npka dfSrtoamr tt(h2e,  c'o0n't)e}x`t; 
                                                                                                                                        w}h
                                                                                                                                        e
                                                                                                                                        nf ucnicttiinogn  af osromuartcSeo u-r cfeo(rfmialte piatt ha:s  sat rcilnigc,k asboluer cmeaUrrkld?o:w ns tlriinnkg
                                                                                                                                         -|  Tnhuel ls,o ucrhcuen kl?i:n ksst railnrge)a:d ys tirnicnlgu d{e
                                                                                                                                           t icmoensstta mfpisl ewnhaemree  =a vfaiilleapbalteh .-s pulsiet (t'h/e'm) .epxoapc(t)l y| |a sf iplreopvaitdhe;d
                                                                                                                                           
                                                                                                                                            -  cNoEnVsEtR  tirnavnesnctr ioprt Mgautecshs  =n afmielse,n atmiet.lmeast,c ho(r/ tcroanntsaccrti pitn_f(o\rdm{a4t}i-o\nd {-2 }i-f\ dy{o2u} )c_a(n[n^o_t] +f)i/n)d; 
                                                                                                                                            i t  iifn  (tthrea ncsocnrtiepxttM,a tscahy)  s{o
                                                                                                                                              e x p lciocnisttl yd
                                                                                                                                              a-t eW h=e nt raannsswcerriipntgM aqtucehs[t1i]o;n
                                                                                                                                              s   a b ocuotn sbtu dvgiedteso,I dp o=s ittriaonnssc,r ispatlMaarticehs[,2 ]o.rr ecpulrarceen(t' _ppoalritc1i'e,s ,' 'a)l.wraeypsl apcree(f'e_rp atrhte2 'm,o s't' )r.erceepnlta cdeo(c'u.mtexntt's,  ('h'i)g;h
                                                                                                                                              e s t   DcAoTnEs tv ablauseesU)r.l  I=f  scoiutricnegU roll d|e|r  `dhatttap,s :n/o/tyeo utthueb ey.ecaorm /ewxaptlcihc?ivt=l$y{
                         v-i dWehoeInd }m`u;l
                         t i p l ec ocnhsutn ksse csohnadrse  =t hceh usnakm e?  seoxutrrcaec tfTiilmee,s ttarmepa(tc htuhnekm)  a:s  npualrlt;s
                           o f   tchoen ssta muer ld o=c usmeecnotn dasn d?  s`y$n{tbhaesseiUzrel }t&hte=m$ {isnetcoo nad sc}o`m p:l ebtaes eaUnrslw;e
                           r   r a tchoenrs tt htainm etLraebaetli n=g  seeaccohn dsse p?a r`a t~e$l{yf
                                                                                                     o-r mWahteTni mseo(mseeocnoen dpsu)s}h`e s:  b'a'c;k
                                                                                                       o n   yroeutru rann s`wReSrU 5o rB oaasrkds  Mteoe tgion gd eTerpaenrs,c rliopotk  -f o$r{ daadtdei}t i(o[nWaalt ccho nvtiedxeto $a{ctriomsesL aablell }p]r(o$v{iudreld} )c)h`u;n
                                                                                                       k s  }f
                                                                                                       r o mc otnhset  sbaomaer dsMoautrcche  =b effiolreen asmaey.imnagt cyho(u/ (d\od {n4o}t- \hda{v2e} -e\ndo{u2g}h) _iRnSfUo5r_mBaotairodn_
                                                                                                       M-e eDtoi nngo/t) ;s
                                                                                                       e c oinfd -(gbuoeasrsd Maa tccohr)r e{c
                                                                                                       t   a n scwoenrs ts idmaptley  =b ebcoaaursdeM astocmhe[o1n]e; 
                                                                                                       c h a l lceonngsets  biats e-U rilf  =y osuoru rscoeuUrrcle s| |s u`phptotrpts :t/h/ew wawn.sywoeurt,u bset.acnodm /b@yr siut5 lainvde sctirteea mt5h2e4m`
                                                                                                       ;-
                                                                                                         B e   nceountsrta ls eacnodn dfsa c=t ucahlu n-k  d?o  enxottr atcatkTei mpeosstiatmipo(ncsh uonnk )p o:l incuyl ld;e
                                                                                                         b a t e sc
                                                                                                         o-n sItf  utrhle  =a nssewceorn diss  ?n o`t$ {ibna stehUer lp}r&otv=i$d{esde ccoonndtse}x`t ,:  sbaays esUor lc;l
                                                                                                         e a r l yc ornastth etri mtehLaanb eglu e=s ssiencgo
                                                                                                         n-d sK e?e p`  a~n$s{wfeorrsm actoTnicmies(es ebcuotn dcso)m}p`l e:t e'
                                                                                                         '-; 
                                                                                                         W h e n  rperteusrenn t`iRnSgU 5n uBmoearridc aMle edtaitnag  wTirtahn smcurlitpitp l-e  $c{odlautmen}s ,( [aWlawtacyhs  vuisdee oa$ {mtairmkedLoawbne lt}a]b(l$e{
  u-r lF}o)r)m`a;t
    l i}s
    t s  iafn d( fkielye nfaimgeu.riensc lculdeeasr(l'yR
    S
    UC5O_NMTeEeXtTi nFgR_O3M_ 1R8S_U256 'D)O)C U{M
    E N T S :c
    o$n{scto nsteecxotn}d`s; 
=
  c hcuonnks t?  aenxtthrraocptiTciMmeessstaagmeps( c=h umneks)s a:g ensu.lmla;p
( ( m :  c{o nrsotl eb:a ssetUrriln g=;  `chotnttpesn:t/:/ ysoturtiunbge .}c)o m=/>w a(t{c
h ? v = 5rvocl4eA:d Omr.5rooMl`e; 
a s   ' ucsoenrs't  |u r'la s=s issetcaonntd's, 
  ?   ` $ {cboansteeUnrtl:} &mt.=r$o{lsee c=o=n=d s'}u`s e:r 'b a&s&e Uardlm;i
           n M a t ccho n?s ta cttiumaelLQaubeerly  =:  sme.ccoonndtse n?t ,`
             ~ $}{)f)o;r
             m
             a t Tiifm e((isseAcdomnidns)) }{`
    :   ' 'c;o
           n s t   rreestpuornns e` R=S Ua5w aBiota rcdl iMeenett.imnegs sTargaenss.ccrriepatt e-( {2
           0 2 6 - 0 3 -m1o8d e(l[,W
           a t c h   v imdaexo_$t{otkiemnesL:a b1e0l2}4],(
           $ { u r l } )s)y`s;t
           e m :} 
   s y sitfe m(Psrooumrpcte,U
               r l )   { 
    m e s sraegteusr:n  a`n$t{hfriolpeincaMmees.sraegpelsa,c
    e ( / _ /}g),; 
    '   ' ) .croenpslta caen(s'w.etrxTte'x,t  '=' )r}e s(p[oSnosuer.cceo]n(t$e{nsto
    u r c e U r l.}f)i)l`t;e
r ( (}b
l o crke)t u=r>n  bfliolcekn.atmyep.er e=p=l=a c'et(e/x_t/'g),
  '   ' ) . r.empalpa(c(eb(l'o.ctkx)t '=,>  'b'l)o;c
                        k}.
t
efxutn)c
t i o n   e x.tjroaicnt(N'a'm)e;F
r o m Q uceornys(tq udeerbyu:g Isntfroi n=g )`:\ ns\tnr-i-n-g\ n|* *nAudlmli n{ 
D e bcuogn sItn ffou*l*l\Nna\mne* *=M oqdueelr yu.smeadt:c*h*( /$\{bm(o[dAe-lZ}]\[na*-*zQ]u+e)r\ys:+*(*[ A$-{Za]c[tau-azl]Q+u)e\rby/})\;n
* * Dieft e(cftueldl Nnaammee): *r*e t$u{rdne tfeucltleNdaNmaem[e0 ]|;|
  ' ncoonnes't} \snk*i*pCWhourndkss  =f o[u'nRdS:U*5*' ,$'{MaalilnCeh'u,n'kFsr.eleepnogrtth'},\'nD\unr$h{aaml'l,C'hPuonwknsa.lm'a,p'(M(ocn,d aiy)' ,='>T u`e*s*d$a{yi' ,+
    1 } . *'*W eSdcnoersed:a y$'{,('cT.hsuirmsidlaayr'i,t'yF raisd anyu'm,b'eJra)n.utaorFyi'x,e'dF(e3b)r}u a|r yT'y,p'eM:a r$c{hc'.,d'oAcp_rtiylp'e, '|M|a y''?,''}J u|n eD'a,t
                                 e :   $ {'cJ.udloyc'_,d'aAtueg u|s|t '',?''S}e p|t eSmcbheoro'l,:' O$c{tco.bsecrh'o,o'lN o|v|e m'bneorn'e,''}D\enc>e mSboeurr'c]e;:
                                   $ {cfoonrsmta tsSionugrlceeN(acm.ef i=l eqpuaetrhy,. mca.tscohu(r/c\eb_(u[rAl-,Z ]c[.ac-hzu]n{k2),}}\)n\>b /$g{)c;.
                                 c h uinfk .(ssliincgel(e0N,a m1e5)0 ){}
                                                                                                                                                  . . . ` )c.ojnositn (n'a\mne\ n=' )s}i`n;g
                                                                                                                                                  l e N a mree.tfuirnnd (nne w= >R e!sspkoinpsWeo(radnss.wienrcTleuxdte s+( nd)e)b;u
                                                                                                                                                  g I n f oi,f  {( nhaemaed)e rrse:t u{r n' Cnoanmtee;n
                                                                                                                                                    t - T}y
                                                                                                                                                                 p e 'r:e t'utrenx tn/upllla;i
                                                                                                                                                                 n}'
                                                                                                                                                     
                                                                                                                                                 }e x}p)o;r
t   a}s
y
n c  cfounnsctt isotnr ePaOmS T=( raewqa:i tR ecqluieesntt). m{e
s s acgoenss.ts t{r emaems(s{a
                             g e s   }m o=d ealw,a
                  i t   r emqa.xj_stoonk(e)n;s
                  :   1c0o2n4s,t
                    l a s tsUyssetreMme:s ssaygset e=m P[r.o.m.pmte,s
                      s a g e sm]e.srseavgeerss:e (a)n.tfhirnodp(i(cmM:e s{s argoelse,:
                        s t}r)i;n
                  g
                 } )c o=n>s tm .ernocloed e=r= ==  'nueswe rT'e)x?t.Ecnocnotdeenrt( )?;?
    ' 'c;o
                                                               n
                                                               s t  croenasdta baldem i=n Mnaetwc hR e=a dlaabslteUSsterreMaems(s{a
                                                                                                                                  g e . m aatscyhn(c/ ^satdamritn(:c\osn*t(r.o+l)l$e/ri)) ;{
                                                                                                                                    
                                                                                                                                      c o n s tf oirs Aadwmaiint  =( caodnmsitn Mcahtucnhk  !o=f=  snturlela;m
                                                                                                                                    )   {c
                                                                                                                                         o n s t   a c t uiafl Q(ucehruyn k=. tiyspAed m=i=n=  ?' caodnmtiennMta_tbclho[c1k]_ d:e lltaas't U&s&e rcMheusnska.gdee;l
                                                                                                                                         t
                                                                                                                                         a . tcyopnes t= =m=o d'etle x=t _sdeelletcat'M)o d{e
                                                                                                                                                                                            l ( a c t u a l Q u ecroyn)t;r
                                                                                                                                                                                            o l lceorn.setn qcuheuunek(Leinmciotd e=r .meondceold e=(=c=h u'nckl.aduedlet-as.otnenxett)-)4;-
                                                                                                                                                                                              5 '   ?   6   :  }5
                                                                                                                                                                                              ; 
                                                                                                                                          
                                                                                                                                              c o}n
                                                                                                                                         s t   r e l ecvoannttrCohlulnekrs. c=l oaswea(i)t; 
                                                                                                                                    f i n d R}e,l
                                                                                                                                    e v a}n)t;C
                                                                                                                                  h
                                                                                                                                  u n krse(taucrtnu anleQwu eRreys,p ocnhsuen(krLeiamdiatb)l;e
                                                                                                                                  ,
                                                                                                                                    { 
                                                                                                                                    c o n s th edaedteercst:e d{N a'mCeo n=t eenxtt-rTaycpteN'a:m e'FtreoxmtQ/upelrayi(na;c tcuhaalrQsueetr=yu)t;f
                                                                                                                                    - 8 'c o}n,s
                                                                                                                                    t   s}t)a;f
                                                                                                                                  f}Chunks = detectedName
                                                                   ? await findRelevantChunks(`${detectedName} RSU5 staff directory`, 2)
                                                                     : [];
                                                                 const allChunks = [...relevantChunks];
                                                                 for (const sc of staffChunks) {
                                                                       if (!allChunks.find(c => c.chunk === sc.chunk)) {
                                                                               allChunks.push(sc);
                                                                       }
                                                                 }

  const context = allChunks.length > 0
                                                                   ? allChunks.map((c) => {
                                                                             const meta = [
                                                                                         c.doc_type ? `TYPE: ${c.doc_type}` : '',
                                                                                         c.doc_date ? `DATE: ${c.doc_date}` : '',
                                                                                         c.school   ? `SCHOOL: ${c.school}` : '',
                                                                                       ].filter(Boolean).join(' | ');
                                                                             return `[Source: ${formatSource(c.filepath, c.source_url, c.chunk)}${meta ? ` | ${meta}` : ''}]\n${c.chunk}`;
                                                                   }).join('\n\n---\n\n')
        : 'No relevant documents found.';

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are the RSU5 Community Information Assistant - a neutral, factual resource for the Regional School Unit 5 community in Freeport, Durham, and Pownal, Maine.
  You answer questions about RSU5 board meetings, budgets, policies, school calendars, and district decisions using only the official RSU5 documents provided below.

  KNOWN RSU5 FACTS (always accurate, do not contradict):
  - Superintendent: Tom Gray (grayt@rsu5.org)
  - District: Regional School Unit 5, serving Freeport, Durham, and Pownal, Maine

  Guidelines:
  - Be accurate and cite your sources by mentioning the document or meeting date
  - Always include the source link from the context when citing a source - format it as a clickable markdown link
  - The source links already include timestamps where available - use them exactly as provided
  - NEVER invent or guess names, titles, or contact information - if you cannot find it in the context, say so explicitly
  - When answering questions about budgets, positions, salaries, or current policies, always prefer the most recent documents (highest DATE values). If citing older data, note the year explicitly
  - When multiple chunks share the same source file, treat them as parts of the same document and synthesize them into a complete answer rather than treating each separately
  - When someone pushes back on your answer or asks to go deeper, look for additional context across all provided chunks from the same source before saying you do not have enough information
  - Do not second-guess a correct answer simply because someone challenges it - if your sources support the answer, stand by it and cite them
  - Be neutral and factual - do not take positions on policy debates
  - If the answer is not in the provided context, say so clearly rather than guessing
  - Keep answers concise but complete
  - When presenting numerical data with multiple columns, always use a markdown table
  - Format lists and key figures clearly

  CONTEXT FROM RSU5 DOCUMENTS:
  ${context}`;

  const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.role === 'user' && adminMatch ? actualQuery : m.content,
  }));

  if (isAdmin) {
        const response = await client.messages.create({
                model,
                max_tokens: 1024,
                system: systemPrompt,
                messages: anthropicMessages,
        });
        const answerText = response.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('');
        const debugInfo = `\n\n---\n**Admin Debug Info**\n\n**Model used:** ${model}\n**Query:** ${actualQuery}\n**Detected name:** ${detectedName || 'none'}\n**Chunks found:** ${allChunks.length}\n\n${allChunks.map((c, i) => `**${i + 1}.** Score: ${(c.similarity as number).toFixed(3)} | Type: ${c.doc_type || '?'} | Date: ${c.doc_date || '?'} | School: ${c.school || 'none'}\n> Source: ${formatSource(c.filepath, c.source_url, c.chunk)}\n> ${c.chunk.slice(0, 150)}...`).join('\n\n')}`;
        return new Response(answerText + debugInfo, { headers: { 'Content-Type': 'text/plain' } });
  }

  const stream = await client.messages.stream({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: anthropicMessages,
  });

  const encoder = new TextEncoder();
                                                                 const readable = new ReadableStream({
                                                                       async start(controller) {
                                                                               for await (const chunk of stream) {
                                                                                         if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                                                                                                     controller.enqueue(encoder.encode(chunk.delta.text));
                                                                                         }
                                                                               }
                                                                               controller.close();
                                                                       },
                                                                 });

  return new Response(readable, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
                                                              }
