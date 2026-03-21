'use client';

import { useState, useRef, useEffect } from 'react';

const SUGGESTED = [
    "What positions are being reduced in the FY27 superintendent's recommended budget?",
    "What was the RSU5 budget total in 2020?",
    "What is the graduation requirement at Freeport High School?",
    "What did the board vote on at the March 2026 meeting?",
    "What did the board discuss about the FY27 budget at the November 2025 meeting?",
  ];

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

export default function Home() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text: string) {
        if (!text.trim() || isLoading) return;
        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

      try {
              const res = await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ messages: newMessages }),
              });

          if (!res.body) throw new Error('No response body');
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let assistantContent = '';
              const assistantId = (Date.now() + 1).toString();

          setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

          while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value);
                    assistantContent += chunk;
                    setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
          }
      } catch (e) {
              setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
      }
        setIsLoading(false);
  }

  return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
              <header className="bg-[#8B1A1A] text-white shadow-md">
                      <div className="max-w-3xl mx-auto px-4 py-4">
                                <div className="flex items-center justify-between">
                                            <div>
                                                          <h1 className="text-xl font-bold tracking-wide">Community Assistant</h1>h1>
                                                          <p className="text-sm text-red-200">REGIONAL SCHOOL UNIT 5</p>p>
                                            </div>div>
                                            <div className="text-right text-xs text-red-200">
                                                          <div>FREEPORT · DURHAM · POWNAL</div>div>
                                                          <div>MAINE</div>div>
                                            </div>div>
                                </div>div>
                                <p className="text-sm text-red-100 mt-2">
                                            RSU5 document library · Board meetings, budgets, policies and more
                                </p>p>
                      </div>div>
              </header>header>
        
              <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-4">
                {messages.length === 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                                <p className="font-semibold text-gray-800 mb-1">RSU5 Community Information Assistant</p>p>
                                <p className="text-sm text-gray-600 mb-4">
                                              Ask me anything about RSU5 board meetings, budgets, policies, school calendars,
                                              or district decisions. I search official RSU5 documents and cite my sources.
                                </p>p>
                                <p className="text-xs text-gray-400 italic mb-4">
                                              Neutral and factual — this tool does not take positions on policy debates.
                                </p>p>
                                <div className="flex flex-col gap-2">
                                  {SUGGESTED.map((q) => (
                                      <button
                                                          key={q}
                                                          onClick={() => sendMessage(q)}
                                                          className="text-left text-sm text-[#8B1A1A] bg-red-50 hover:bg-red-100 border border-red-200 rounded px-3 py-2 transition-colors"
                                                        >
                                        {q}
                                      </button>button>
                                    ))}
                                </div>div>
                    </div>div>
                      )}
              
                      <div className="flex flex-col gap-4">
                        {messages.map((m) => (
                      <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-lg px-4 py-3 text-sm shadow-sm whitespace-pre-wrap ${
                                        m.role === 'user' ? 'bg-[#8B1A1A] text-white' : 'bg-white border border-gray-200 text-gray-800'
                      }`}>
                                      {m.content}
                                    </div>div>
                                 ' u<s/ed icvl>i
                      e n t ' ; 
                       
                       i m p o)r)t} 
                        {   u s e S t a t e ,{ iussLeoRaedfi,n gu s&e&E f(f
                      e c t   }   f r o m   ' r<edaicvt 'c;l
                      a
                      scsoNnasmte =S"UfGlGeExS TjEuDs t=i f[y
                      - s t"aWrhta"t> 
                      p o s i t i o n s   a r e   b<ediinvg  crleadsuscNeadm ei=n" btgh-ew hFiYt2e7  bsourpdeerri nbtoernddeern-tg'rsa yr-e2c0o0m mreonudnedde db-uldgg eptx?-"4, 
                      p y -"3W htaetx tw-assm  ttheex tR-SgUr5a yb-u4d0g0e ts htaodtoawl- simn" >2
                      0 2 0 ? " , 
                           " W h a t   i sS etahrec hgirnagd uRaStUi5o nd orceuqmueinrtesm.e.n.t
                        a t   F r e e p o r t   H i<g/hd iSvc>h
                      o o l ? " , 
                           " W h a<t/ ddiivd> 
                      t h e   b o a r d   v)o}t
                      e   o n   a t   t h e< dMiavr crhe f2=0{2b6o tmteoemtRienfg}? "/,>
                      
                          " W h a t   d<i/dd itvh>e
                        b o a r d  <d/imsaciuns>s
                       
                      a b o u t   t<hdei vF Yc2l7a sbsuNdagmeet= "astt itchkey  Nboovtetmobme-r0  2b0g2-5w hmieteet ibnogr?d"e,r
                      -]t; 
                      b
                      oirndteerr-fgarcaey -M2e0s0s asghea d{o
                        w - midd":> 
                      s t r i n g ; 
                        < driovl ec:l a'sussNearm'e =|" m'aaxs-swi-s3txaln tm'x;-
                      a u tcoo nptxe-n4t :p ys-t3r"i>n
                      g ; 
                        } 
                       
                       e x p o r<td idve fcalualsts Nfaumnec=t"ifolne xH ogmaep(-)2 "{>
                       
                           c o n s t   [ m e s s<aignepsu,t 
                       s e t M e s s a g e s ]   =  vuasleuSet=a{tien<pMuets}s
                       a g e [ ] > ( [ ] ) ; 
                            coonnCshta n[gien=p{u(te,)  s=e>t IsneptuItn]p u=t (ues.etSatragteet(.'v'a)l;u
                       e ) }c
                       o n s t   [ i s L o a d i n go,n KseeytDIoswLno=a{d(ien)g ]= >=  {u siefS t(aet.ek(efya l=s=e=) ;'
                       E n tceorn's t& &b o!tet.osmhRiefft K=e yu)s e{R eef.<pHrTeMvLeDnitvDEelfeamuelntt(>)(;n usleln)d;M
                       e
                       s s augsee(Eifnfpeuctt)(;( )}  =}>} 
                         { 
                                    b o t t o m R e fp.lcaucrerheonltd?e.rs=c"rAoslkl Ian tqouVeisetwi(o{n  baebhoauvti oRrS:U 5'.s.m.o"o
                       t h '   } ) ; 
                         } ,   [ mdeisssaabgleesd]=){;i
                       s
                       L o aadsiynngc} 
                       f u n c t i o n   s e n d M esstsyalgee=({t{e xcto:l osrt:r i'n#g1)1 1{1
                         1 1 ' ,  ibfa c(k!gtreoxutn.dtCroilmo(r):  |'|# fifsfLfofafd'i n}g})
                         r e t u r n ; 
                                c ocnlsats suNsaemreM=s"gf:l eMxe-s1s abgoer d=e r{  biodr:d eDra-tger.anyo-w3(0)0. trooSutnrdiendg-(l)g,  prxo-l4e :p y'-u2s etre'x,t -csomn tfeonctu:s :toeuxttl i}n;e
                       - n o n ec ofnosctu sn:erwiMnegs-s2a gfeosc u=s :[r.i.n.gm-e[s#s8aBg1eAs1,A ]u sfeorcMussg:]b;o
                       r d e r -stertaMnesspsaargeenst("n
                       e w M e s s a g e s ) ; 
                       / > 
                           s e t I n p u t ( ' '<)b;u
                           t t o n 
                           s e t I s L o a d i n g ( t rouneC)l;i
                           c
                           k = { ( )t r=y>  {s
                             e n d M e s scaognes(ti nrpeust )=} 
                           a w a i t   f e t c h ( ' / adpiis/acbhlaetd'=,{ i{s
                             L o a d i n g } 
                           m e t h o d :   ' P O S T ' ,s
                           t y l e = { {   bhaecakdgerrosu:n d{C o'lCoorn:t e'n#t8-BT1yAp1eA'':,  'caoplpolri:c a't#ifofnf/fjfsfo'n '} }}
                           , 
                                            b o d y :c lJaSsOsNN.asmter=i"nrgoiufnyd(e{d -mlegs spaxg-e4s :p yn-e2w Mteesxsta-gsems  f}o)n,t
                           - m e d i u m} )h;o
                           v
                           e r : o p a ciift y(-!9r0e st.rbaondsyi)t itohnr-oowp anceiwt yE"r
                           r o r ( ' N o   r e s p o>n
                           s e   b o d y ' ) ; 
                                   S e ncdo
                           n s t   r e a d e r   =  <r/ebsu.tbtoodny>.
                           g e t R e a d e r ( )<;/
                           d i v > 
                               c o n s t   d e c<opd ecrl a=s snNeawm eT=e"xtteDxetc-oxdse rt(e)x;t
                           - g r a y - 4l0e0t  mats-s1i stteaxntt-Ccoenntteenrt" >=
                             ' ' ; 
                                        c oRnSsUt5  aCsosmimsutnainttyI dA s=s i(sDtaatnet. n·o wP(o)w e+r e1d) .btyo SCtlraiundge( )A;I
                            
                           ·  N o t   a ns eotfMfeiscsiaagle sd(ipsrtervi c=t>  r[e.s.o.uprrceev
                           ,   {   i d :   a s s<i/spt>a
                           n t I d ,   r o l<e/:d i'va>s
                           s i s t a n t<'/,d icvo>n
                           t e n t :< /'d'i v}>]
                           ) ; 
                           )
                           ; 
                             }    while (true) {
                                       const { done, value } = await reader.read();
                                   if (done) break;
                                   const chunk = decoder.decode(value);
                                   assistantContent += chunk;
                                   setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
                             }
                             } catch (e) {
                                     setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
                             }
                               setIsLoading(false);
                             }
                           
                             return (
                               <div className="min-h-screen bg-gray-50 flex flex-col">
                                     <header className="bg-[#8B1A1A] text-white shadow-md">
                                             <div className="max-w-3xl mx-auto px-4 py-4">
                                                       <div className="flex items-center justify-between">
                                                                   <div>
                                                                                 <h1 className="text-xl font-bold tracking-wide">Community Assistant</h1>h1>
                                                                                 <p className="text-sm text-red-200">REGIONAL SCHOOL UNIT 5</p>p>
                                                                   </div>div>
                                                                   <div className="text-right text-xs text-red-200">
                                                                                 <div>FREEPORT · DURHAM · POWNAL</div>div>
                                                                                 <div>MAINE</div>div>
                                                                   </div>div>
                                                       </div>div>
                                                       <p className="text-sm text-red-100 mt-2">
                                                                   RSU5 document library · Board meetings, budgets, policies and more
                                                       </p>p>
                                             </div>div>
                                     </header>header>
                               
                                     <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-4">
                                       {messages.length === 0 && (
                                  <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                                              <p className="font-semibold text-gray-800 mb-1">RSU5 Community Information Assistant</p>p>
                                              <p className="text-sm text-gray-600 mb-4">
                                                            Ask me anything about RSU5 board meetings, budgets, policies, school calendars,
                                                            or district decisions. I search official RSU5 documents and cite my sources.
                                              </p>p>
                                              <p className="text-xs text-gray-400 italic mb-4">
                                                            Neutral and factual — this tool does not take positions on policy debates.
                                              </p>p>
                                              <div className="flex flex-col gap-2">
                                                {SUGGESTED.map((q) => (
                                                    <button
                                                                        key={q}
                                                                        onClick={() => sendMessage(q)}
                                                                        className="text-left text-sm text-[#8B1A1A] bg-red-50 hover:bg-red-100 border border-red-200 rounded px-3 py-2 transition-colors"
                                                                      >
                                                      {q}
                                                    </button>button>
                                                  ))}
                                              </div>div>
                                  </div>div>
                                             )}
                                     
                                             <div className="flex flex-col gap-4">
                                               {messages.map((m) => (
                                    <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                  <div className={`max-w-[85%] rounded-lg px-4 py-3 text-sm shadow-sm whitespace-pre-wrap ${
                                                      m.role === 'user' ? 'bg-[#8B1A1A] text-white' : 'bg-white border border-gray-200 text-gray-800'
                                    }`}>
                                                    {m.content}
                                                  </div>div>
                                    </div>div>
                                  ))}
                                               {isLoading && (
                                    <div className="flex justify-start">
                                                  <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-400 shadow-sm">
                                                                  Searching RSU5 documents...
                                                  </div>div>
                                    </div>div>
                                                       )}
                                                       <div ref={bottomRef} />
                                             </div>div>
                                     </main>main>
                               
                                     <div className="sticky bottom-0 bg-white border-t border-gray-200 shadow-md">
                                             <div className="max-w-3xl mx-auto px-4 py-3">
                                                       <div className="flex gap-2">
                                                                   <input
                                                                                   value={input}
                                                                                   onChange={(e) => setInput(e.target.value)}
                                                                                   onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                                                                                   placeholder="Ask a question about RSU5..."
                                                                                   disabled={isLoading}
                                                                                   style={{ color: '#111111', backgroundColor: '#ffffff' }}
                                                                                   className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A] focus:border-transparent"
                                                                                 />
                                                                   <button
                                                                                   onClick={() => sendMessage(input)}
                                                                                   disabled={isLoading}
                                                                                   style={{ backgroundColor: '#8B1A1A', color: '#ffffff' }}
                                                                                   className="rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                                                                                 >
                                                                                 Send
                                                                   </button>button>
                                                       </div>div>
                                                       <p className="text-xs text-gray-400 mt-1 text-center">
                                                                   RSU5 Community Assistant · Powered by Claude AI · Not an official district resource
                                                       </p>p>
                                             </div>div>
                                     </div>div>
                               </div>div>
                             );
                             }</div>
