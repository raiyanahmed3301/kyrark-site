'use strict';
const $=id=>document.getElementById(id);
const el=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x)n.textContent=x;return n};

const menu=$('menu'),links=$('links');
if(menu&&links){
  const setMenu=open=>{
    links.classList.toggle('open',open);
    menu.setAttribute('aria-expanded',String(open));
    menu.setAttribute('aria-label',open?'Close menu':'Open menu');
    document.body.classList.toggle('nav-open',open);
  };
  menu.addEventListener('click',()=>setMenu(!links.classList.contains('open')));
  links.addEventListener('click',e=>{if(e.target.closest('a'))setMenu(false)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setMenu(false)});
}

const wr=$('wr');
if(wr){
  const W=[
    ['Threat 01','AI-Enhanced Phishing and Deepfake Social Engineering','Generative AI removes the language errors that once exposed phishing and enables cloned voices for executive impersonation.','Security-awareness literature increasingly finds that "spot the typo" training is obsolete. Industry breach reports consistently rank phishing and the human element among top initial-access vectors.',['Phishing-resistant MFA (FIDO2/passkeys)','Out-of-band verification for payments and resets','SPF, DKIM and DMARC at enforcement','Process-focused awareness training']],
    ['Threat 02','Ransomware-as-a-Service and Double Extortion','Affiliates rent mature tooling and steal data before encrypting, so backups alone no longer remove extortion leverage.','Advisories from CISA and the NCSC describe a common chain: stolen credentials or exposed remote services, lateral movement, backup destruction, exfiltration, then encryption.',['Offline, immutable, restore-tested backups','Patch internet-facing services; close exposed RDP/VPN','Segmentation and least-privilege administration','EDR with tested mass-encryption detections']],
    ['Threat 03','Software Supply-Chain Compromise','Attackers poison dependencies, build systems or maintainer accounts so malicious code ships through trusted updates.','NIST SSDF, SLSA and OpenSSF Scorecard form the core literature. Research highlights typosquatting, dependency confusion and maintainer takeover as recurring patterns.',['Pin dependencies and verify integrity hashes','Maintain SBOMs and monitor for new CVEs','Harden CI/CD with short-lived tokens and signed builds','Vet new or low-reputation packages']],
    ['Threat 04','Identity Attacks: Session Token Theft and MFA Fatigue','Adversary-in-the-middle kits steal session tokens after MFA, while repeated push prompts pressure users into approval.','MITRE ATT&CK catalogues these under credential access and valid accounts. Vendor and CISA guidance converge on phishing-resistant authentication and continuous session evaluation.',['Passkeys or hardware keys for privileged roles','Number matching and rate limits on push MFA','Conditional access and device-bound, short-lived sessions','Alerting on anomalous token use']]
  ];
  W.forEach(w=>{
    const d=el('details'),s=el('summary'),h=el('h3',0,w[1]);
    s.append(el('span','id mono',w[0]));h.append(el('small',0,w[2]));s.append(h);
    const b=el('div','body'),a=el('div'),m=el('div'),u=el('ul');
    a.append(el('h5',0,'Literature review'),el('p',0,w[3]));
    w[4].forEach(i=>u.append(el('li',0,i)));m.append(el('h5',0,'Mitigations'),u);
    b.append(a,m);d.append(s,b);wr.append(d);
  });
}

const f=$('f'),msg=$('msg');
if(f&&msg){
  const submit=f.querySelector('button[type="submit"]');
  const setFormMessage=(text,isError=false)=>{msg.textContent=text;msg.classList.toggle('error',isError)};
  const params=new URLSearchParams(location.search);
  if(params.get('sent')==='1')setFormMessage('Your enquiry was sent. We’ll be in touch soon.');
  if(params.get('error')==='1')setFormMessage('We could not send your enquiry. Please check the form and try again.',true);
  if(params.has('sent')||params.has('error'))history.replaceState({},'',`${location.pathname}${location.hash||'#contact'}`);

  f.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!f.reportValidity())return;
    const hp=f.elements.fax||f.elements.website;
    if(hp&&hp.value)return;
    setFormMessage('Sending your enquiry…');
    if(submit)submit.disabled=true;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const data=Object.fromEntries(new FormData(f));
      const response=await fetch(f.action,{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify(data),
        signal:controller.signal,
        credentials:'same-origin',
      });
      const contentType=response.headers.get('content-type')||'';
      const result=contentType.includes('application/json')?await response.json().catch(()=>({})):{};
      if(!response.ok){
        const fallback=response.status===400?'Please check your details, service, message, and consent.':response.status===429?'Too many enquiries were submitted. Please wait a few minutes and try again.':response.status===503?'Enquiry delivery is not configured yet. Please try again later.':'We could not send your enquiry. Please try again later.';
        throw new Error(fallback);
      }
      if(!result.ok)throw new Error('The contact service did not confirm delivery. Please try again later.');
      f.reset();
      setFormMessage('Your enquiry was sent. We’ll be in touch soon.');
    }catch(error){
      const timeout=error&&(error.name==='AbortError'||error.name==='TimeoutError');
      const offline=error instanceof TypeError;
      const message=timeout?'The request timed out. Please try again.':offline?'Could not reach the contact service. Check your connection and try again.':'We could not send your enquiry. Please try again later.';
      setFormMessage(error&&error.message&&!offline&&!timeout?error.message:message,true);
    }finally{
      clearTimeout(timer);
      if(submit)submit.disabled=false;
    }
  });
}
