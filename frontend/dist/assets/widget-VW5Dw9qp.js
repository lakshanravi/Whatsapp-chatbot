const $={apiBaseUrl:"https://botbackend.pentarixlabs.com",companyId:"",title:"Pentarix AI Assistant",subtitle:"Ask from our knowledge base",accentColor:"#111827",headerColor:"",headerTextColor:"",sendButtonColor:"",launcherColor:"",launcherIcon:"bot",position:"right",apiKey:""};function I(e){return`rag_widget_session_${e}`}function k(e){const r=`web_${crypto.randomUUID()}`;return localStorage.setItem(I(e),r),r}function q(e){const r=I(e);let o=localStorage.getItem(r);return o||(o=k(e)),o}function m(e,r){return typeof e=="string"&&/^#[0-9a-fA-F]{6}$/.test(e)?e:r}function L(e){return e==="question"?"?":e==="message"?`
      <svg class="ragw-launcher-svg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
      </svg>
    `:`
    <svg class="ragw-launcher-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8V4"></path>
      <path d="M8 4h8"></path>
      <rect x="5" y="8" width="14" height="11" rx="3"></rect>
      <path d="M9 13h.01"></path>
      <path d="M15 13h.01"></path>
      <path d="M9 16h6"></path>
    </svg>
  `}function M(e){const r=document.createElement("style"),o=e.position==="left"?"left":"right",t=m(e.accentColor,"#111827"),a=m(e.headerColor,t),s=m(e.headerTextColor,"#ffffff"),l=m(e.sendButtonColor,t),n=m(e.launcherColor,t);r.textContent=`
    .ragw-root{position:fixed;${o}:20px;bottom:20px;z-index:2147483000;font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#172033}
    .ragw-button{width:58px;height:58px;border:0;border-radius:999px;background:${n};color:#fff;box-shadow:0 18px 45px rgba(15,23,42,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s ease,filter .15s ease}
    .ragw-button:hover{filter:brightness(.95);transform:translateY(-1px)}
    .ragw-launcher-svg{width:29px;height:29px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .ragw-panel{display:none;width:min(380px,calc(100vw - 32px));height:min(620px,calc(100vh - 104px));margin-bottom:14px;border:1px solid #d9e0ea;border-radius:10px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.24);overflow:hidden}
    .ragw-open .ragw-panel{display:flex;flex-direction:column}
    .ragw-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;background:${a};color:${s};padding:14px 16px}
    .ragw-header-copy{min-width:0}
    .ragw-title{font-size:15px;font-weight:800;margin:0}
    .ragw-subtitle{font-size:12px;opacity:.82;margin:3px 0 0}
    .ragw-header-actions{display:flex;align-items:center;gap:4px}.ragw-new-chat,.ragw-close{display:grid;flex:0 0 auto;height:28px;padding:0 8px;border:0;border-radius:999px;background:transparent;color:inherit;line-height:1;cursor:pointer;place-items:center}.ragw-new-chat{font-size:12px}.ragw-close{width:28px;padding:0;font-size:22px}.ragw-new-chat:hover,.ragw-close:hover{background:rgba(127,127,127,.14)}
    .ragw-messages{flex:1;overflow:auto;padding:14px;background:#f6f8fb}
    .ragw-msg{max-width:88%;padding:11px 13px;margin:0 0 12px;border-radius:12px;font-size:14px;line-height:1.55;box-shadow:0 2px 8px rgba(15,23,42,.05)}
    .ragw-user{margin-left:auto;background:${l};color:#fff}
    .ragw-bot{background:#fff;border:1px solid #e1e7ef;color:#172033}
    .ragw-sources{margin-top:8px;border-top:1px solid #e6ebf2;padding-top:7px;font-size:11px;color:#64748b}
    .ragw-media{display:grid;gap:8px;margin:0 0 10px}.ragw-media img{display:block;width:100%;max-height:240px;object-fit:contain;border:1px solid #e1e7ef;border-radius:9px;background:#f8fafc}
    .ragw-suggestions{display:grid;gap:6px;margin-top:10px}.ragw-suggestion{width:100%;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;color:#1e293b;padding:8px 9px;text-align:left;font:inherit;font-size:12px;line-height:1.35;cursor:pointer}.ragw-suggestion:hover{border-color:${l};background:#f1f5f9}.ragw-suggestion:disabled{opacity:.55;cursor:not-allowed}
    .ragw-line{min-height:1em;margin:0 0 5px}.ragw-line:last-child{margin-bottom:0}
    .ragw-list{padding-left:18px;margin:6px 0}.ragw-list li{margin:3px 0}
    .ragw-typing{display:flex;gap:4px;align-items:center;width:48px}
    .ragw-dot{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:ragw-pulse 1.2s infinite}
    .ragw-dot:nth-child(2){animation-delay:.15s}.ragw-dot:nth-child(3){animation-delay:.3s}
    @keyframes ragw-pulse{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
    .ragw-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e1e7ef;background:#fff}
    .ragw-input{flex:1;min-width:0;height:40px;border:1px solid #cbd5e1;border-radius:7px;padding:0 10px;font-size:14px;outline:none}
    .ragw-send{height:40px;border:0;border-radius:7px;background:${l};color:#fff;padding:0 14px;font-weight:700;cursor:pointer}
    .ragw-send:disabled{opacity:.55;cursor:not-allowed}
  `,document.head.appendChild(r)}function v(e,r){const o=/(\*\*[^*]+\*\*|\*[^*]+\*)/g;for(const t of r.split(o).filter(Boolean))if(t.startsWith("**")&&t.endsWith("**")){const a=document.createElement("strong");a.textContent=t.slice(2,-2),e.appendChild(a)}else if(t.startsWith("*")&&t.endsWith("*")){const a=document.createElement("em");a.textContent=t.slice(1,-1),e.appendChild(a)}else e.appendChild(document.createTextNode(t))}function z(e,r){let o=null;for(const t of String(r||"").split(`
`)){const a=t.match(/^\s*[-*]\s+(.+)/);if(a){o||(o=document.createElement("ul"),o.className="ragw-list",e.appendChild(o));const l=document.createElement("li");v(l,a[1]),o.appendChild(l);continue}o=null;const s=document.createElement("div");s.className="ragw-line",v(s,t),e.appendChild(s)}}function g(e,r,o=[],t=null,a=[],s=[]){const l=document.createElement("div");if(l.className=`ragw-msg ${e==="user"?"ragw-user":"ragw-bot"}`,e!=="user"&&s.length){const n=document.createElement("div");n.className="ragw-media";for(const d of s){const i=document.createElement("img");i.src=d.url,i.alt=d.altText||"Supporting document image",i.loading="lazy",n.appendChild(i)}l.appendChild(n)}if(z(l,r),o.length){const n=document.createElement("div");n.className="ragw-sources";const d=[...new Set(o.map(i=>i.documentName?i.pageNumber?`${i.documentName} (page ${i.pageNumber})`:i.documentName:"").filter(Boolean))];n.textContent=`Sources: ${d.join(", ")}`,l.appendChild(n)}if(e!=="user"&&a.length){const n=document.createElement("div");n.className="ragw-suggestions";for(const d of a){const i=document.createElement("button");i.type="button",i.className="ragw-suggestion",i.textContent=d.label,i.addEventListener("click",()=>{var w;n.querySelectorAll("button").forEach(f=>{f.disabled=!0}),(w=t==null?void 0:t.onSuggestion)==null||w.call(t,d.message,d.label)}),n.appendChild(i)}l.appendChild(n)}return l}function S(){const e=document.createElement("div");return e.className="ragw-msg ragw-bot ragw-typing",e.setAttribute("aria-label","Assistant is typing"),e.innerHTML='<span class="ragw-dot"></span><span class="ragw-dot"></span><span class="ragw-dot"></span>',e}async function H(e,r,o,{isSuggestion:t=!1}={}){const a=await fetch(`${e.apiBaseUrl}/widget/companies/${e.companyId}/chat`,{method:"POST",headers:{"Content-Type":"application/json","X-Widget-API-Key":e.apiKey},body:JSON.stringify({message:r,sessionId:o,customerName:e.customerName||"",customerEmail:e.customerEmail||"",customerPhone:e.customerPhone||"",isSuggestion:t})}),s=await a.json();if(!a.ok)throw new Error(s.error||"Chat request failed");return s}async function W(e,r){const o=await fetch(`${e.apiBaseUrl}/widget/companies/${e.companyId}/chat/history/${encodeURIComponent(r)}`,{headers:{"X-Widget-API-Key":e.apiKey}}),t=await o.json();if(!o.ok)throw new Error(t.error||"Chat history request failed");return t}function y(e={}){const r={...$,...window.RAG_CHAT_WIDGET,...e};if(!r.companyId){console.error("[RAG Widget] companyId is required");return}M(r);let o=q(r.companyId);const t=document.createElement("div");t.className="ragw-root",t.innerHTML=`
    <section class="ragw-panel">
      <header class="ragw-header">
        <div class="ragw-header-copy">
          <p class="ragw-title"></p>
          <p class="ragw-subtitle"></p>
        </div>
        <div class="ragw-header-actions">
          <button class="ragw-new-chat" type="button" aria-label="Start a new chat">New chat</button>
          <button class="ragw-close" type="button" aria-label="Close chat">&times;</button>
        </div>
      </header>
      <div class="ragw-messages"></div>
      <form class="ragw-form">
        <input class="ragw-input" type="text" placeholder="Type your question" autocomplete="off" />
        <button class="ragw-send" type="submit">Send</button>
      </form>
    </section>
    <button class="ragw-button" type="button" aria-label="Open chat">${L(r.launcherIcon)}</button>
  `,t.querySelector(".ragw-title").textContent=r.title,t.querySelector(".ragw-subtitle").textContent=r.subtitle;const a=t.querySelector(".ragw-messages"),s=t.querySelector(".ragw-input"),l=t.querySelector(".ragw-form"),n=t.querySelector(".ragw-send"),d=t.querySelector(".ragw-button"),i=t.querySelector(".ragw-new-chat"),w=t.querySelector(".ragw-close");let f=!1;s.disabled=!0,n.disabled=!0;async function C(c,u=c,{isSuggestion:x=!1}={}){if(!c||!f)return;s.value="",a.appendChild(g("user",u)),a.scrollTop=a.scrollHeight,n.disabled=!0;const p=S();a.appendChild(p),a.scrollTop=a.scrollHeight;const b=o;try{const h=await H(r,c,b,{isSuggestion:x});if(o!==b)return;p.remove(),a.appendChild(g("bot",h.answer,h.sources||[],{onSuggestion:(N,T)=>C(N,T,{isSuggestion:!0})},h.suggestions||[],h.media||[]))}catch(h){if(o!==b)return;p.remove(),a.appendChild(g("bot",h.message||"Unable to send message."))}finally{n.disabled=!1,a.scrollTop=a.scrollHeight}}d.addEventListener("click",()=>t.classList.toggle("ragw-open")),i.addEventListener("click",()=>{o=k(r.companyId),a.replaceChildren(g("bot",r.greeting||"Hi, how can I help?")),s.value="",s.focus()}),w.addEventListener("click",()=>t.classList.remove("ragw-open")),l.addEventListener("submit",async c=>{c.preventDefault(),await C(s.value.trim())}),document.body.appendChild(t);async function A(){const c=S();a.appendChild(c);try{const u=await W(r,o);c.remove();const x=Array.isArray(u.messages)?u.messages:[];if(!x.length){a.appendChild(g("bot",r.greeting||"Hi, how can I help?"));return}for(const p of x)a.appendChild(g(p.role,p.content,p.sources||[],null,[],p.media||[]))}catch(u){c.remove(),console.warn("[RAG Widget] Unable to restore chat history",u),a.appendChild(g("bot","I couldn't load your earlier messages, but you can start a new chat here."))}finally{f=!0,s.disabled=!1,n.disabled=!1,a.scrollTop=a.scrollHeight}}A()}window.RAGChatWidget={init:y};var E;((E=window.RAG_CHAT_WIDGET)==null?void 0:E.autoInit)!==!1&&(document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>y()):y());
