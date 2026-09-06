(function(){"use strict";var I;const N={apiBaseUrl:"https://botbackend.pentarixlabs.com",companyId:"",title:"Support Chat",subtitle:"Ask from our knowledge base",accentColor:"#111827",headerColor:"",headerTextColor:"",sendButtonColor:"",launcherColor:"",launcherIcon:"bot",position:"right",apiKey:""};function y(e){return`rag_widget_session_${e}`}function C(e){const r=`web_${crypto.randomUUID()}`;return localStorage.setItem(y(e),r),r}function $(e){const r=y(e);let o=localStorage.getItem(r);return o||(o=C(e)),o}function u(e,r){return typeof e=="string"&&/^#[0-9a-fA-F]{6}$/.test(e)?e:r}function A(e){return e==="question"?"?":e==="message"?`
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
  `}function T(e){const r=document.createElement("style"),o=e.position==="left"?"left":"right",t=u(e.accentColor,"#111827"),a=u(e.headerColor,t),n=u(e.headerTextColor,"#ffffff"),s=u(e.sendButtonColor,t),l=u(e.launcherColor,t);r.textContent=`
    .ragw-root{position:fixed;${o}:20px;bottom:20px;z-index:2147483000;font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#172033}
    .ragw-button{width:58px;height:58px;border:0;border-radius:999px;background:${l};color:#fff;box-shadow:0 18px 45px rgba(15,23,42,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s ease,filter .15s ease}
    .ragw-button:hover{filter:brightness(.95);transform:translateY(-1px)}
    .ragw-launcher-svg{width:29px;height:29px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .ragw-panel{display:none;width:min(380px,calc(100vw - 32px));height:min(620px,calc(100vh - 104px));margin-bottom:14px;border:1px solid #d9e0ea;border-radius:10px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.24);overflow:hidden}
    .ragw-open .ragw-panel{display:flex;flex-direction:column}
    .ragw-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;background:${a};color:${n};padding:14px 16px}
    .ragw-header-copy{min-width:0}
    .ragw-title{font-size:15px;font-weight:800;margin:0}
    .ragw-subtitle{font-size:12px;opacity:.82;margin:3px 0 0}
    .ragw-header-actions{display:flex;align-items:center;gap:4px}.ragw-new-chat,.ragw-close{display:grid;flex:0 0 auto;height:28px;padding:0 8px;border:0;border-radius:999px;background:transparent;color:inherit;line-height:1;cursor:pointer;place-items:center}.ragw-new-chat{font-size:12px}.ragw-close{width:28px;padding:0;font-size:22px}.ragw-new-chat:hover,.ragw-close:hover{background:rgba(127,127,127,.14)}
    .ragw-messages{flex:1;overflow:auto;padding:14px;background:#f6f8fb}
    .ragw-msg{max-width:88%;padding:11px 13px;margin:0 0 12px;border-radius:12px;font-size:14px;line-height:1.55;box-shadow:0 2px 8px rgba(15,23,42,.05)}
    .ragw-user{margin-left:auto;background:${s};color:#fff}
    .ragw-bot{background:#fff;border:1px solid #e1e7ef;color:#172033}
    .ragw-sources{margin-top:8px;border-top:1px solid #e6ebf2;padding-top:7px;font-size:11px;color:#64748b}
    .ragw-suggestions{display:grid;gap:6px;margin-top:10px}.ragw-suggestion{width:100%;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;color:#1e293b;padding:8px 9px;text-align:left;font:inherit;font-size:12px;line-height:1.35;cursor:pointer}.ragw-suggestion:hover{border-color:${s};background:#f1f5f9}.ragw-suggestion:disabled{opacity:.55;cursor:not-allowed}
    .ragw-line{min-height:1em;margin:0 0 5px}.ragw-line:last-child{margin-bottom:0}
    .ragw-list{padding-left:18px;margin:6px 0}.ragw-list li{margin:3px 0}
    .ragw-typing{display:flex;gap:4px;align-items:center;width:48px}
    .ragw-dot{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:ragw-pulse 1.2s infinite}
    .ragw-dot:nth-child(2){animation-delay:.15s}.ragw-dot:nth-child(3){animation-delay:.3s}
    @keyframes ragw-pulse{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
    .ragw-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e1e7ef;background:#fff}
    .ragw-input{flex:1;min-width:0;height:40px;border:1px solid #cbd5e1;border-radius:7px;padding:0 10px;font-size:14px;outline:none}
    .ragw-send{height:40px;border:0;border-radius:7px;background:${s};color:#fff;padding:0 14px;font-weight:700;cursor:pointer}
    .ragw-send:disabled{opacity:.55;cursor:not-allowed}
  `,document.head.appendChild(r)}function v(e,r){const o=/(\*\*[^*]+\*\*|\*[^*]+\*)/g;for(const t of r.split(o).filter(Boolean))if(t.startsWith("**")&&t.endsWith("**")){const a=document.createElement("strong");a.textContent=t.slice(2,-2),e.appendChild(a)}else if(t.startsWith("*")&&t.endsWith("*")){const a=document.createElement("em");a.textContent=t.slice(1,-1),e.appendChild(a)}else e.appendChild(document.createTextNode(t))}function q(e,r){let o=null;for(const t of String(r||"").split(`
`)){const a=t.match(/^\s*[-*]\s+(.+)/);if(a){o||(o=document.createElement("ul"),o.className="ragw-list",e.appendChild(o));const s=document.createElement("li");v(s,a[1]),o.appendChild(s);continue}o=null;const n=document.createElement("div");n.className="ragw-line",v(n,t),e.appendChild(n)}}function c(e,r,o=[],t=null,a=[]){const n=document.createElement("div");if(n.className=`ragw-msg ${e==="user"?"ragw-user":"ragw-bot"}`,q(n,r),o.length){const s=document.createElement("div");s.className="ragw-sources";const l=[...new Set(o.map(i=>i.documentName?i.pageNumber?`${i.documentName} (page ${i.pageNumber})`:i.documentName:"").filter(Boolean))];s.textContent=`Sources: ${l.join(", ")}`,n.appendChild(s)}if(e!=="user"&&a.length){const s=document.createElement("div");s.className="ragw-suggestions";for(const l of a){const i=document.createElement("button");i.type="button",i.className="ragw-suggestion",i.textContent=l.label,i.addEventListener("click",()=>{var m;s.querySelectorAll("button").forEach(b=>{b.disabled=!0}),(m=t==null?void 0:t.onSuggestion)==null||m.call(t,l.message,l.label)}),s.appendChild(i)}n.appendChild(s)}return n}function S(){const e=document.createElement("div");return e.className="ragw-msg ragw-bot ragw-typing",e.setAttribute("aria-label","Assistant is typing"),e.innerHTML='<span class="ragw-dot"></span><span class="ragw-dot"></span><span class="ragw-dot"></span>',e}async function L(e,r,o,{isSuggestion:t=!1}={}){const a=await fetch(`${e.apiBaseUrl}/widget/companies/${e.companyId}/chat`,{method:"POST",headers:{"Content-Type":"application/json","X-Widget-API-Key":e.apiKey},body:JSON.stringify({message:r,sessionId:o,customerName:e.customerName||"",customerEmail:e.customerEmail||"",customerPhone:e.customerPhone||"",isSuggestion:t})}),n=await a.json();if(!a.ok)throw new Error(n.error||"Chat request failed");return n}async function M(e,r){const o=await fetch(`${e.apiBaseUrl}/widget/companies/${e.companyId}/chat/history/${encodeURIComponent(r)}`,{headers:{"X-Widget-API-Key":e.apiKey}}),t=await o.json();if(!o.ok)throw new Error(t.error||"Chat history request failed");return t}function f(e={}){const r={...N,...window.RAG_CHAT_WIDGET,...e};if(!r.companyId){console.error("[RAG Widget] companyId is required");return}T(r);let o=$(r.companyId);const t=document.createElement("div");t.className="ragw-root",t.innerHTML=`
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
    <button class="ragw-button" type="button" aria-label="Open chat">${A(r.launcherIcon)}</button>
  `,t.querySelector(".ragw-title").textContent=r.title,t.querySelector(".ragw-subtitle").textContent=r.subtitle;const a=t.querySelector(".ragw-messages"),n=t.querySelector(".ragw-input"),s=t.querySelector(".ragw-form"),l=t.querySelector(".ragw-send"),i=t.querySelector(".ragw-button"),m=t.querySelector(".ragw-new-chat"),b=t.querySelector(".ragw-close");let E=!1;n.disabled=!0,l.disabled=!0;async function k(d,g=d,{isSuggestion:w=!1}={}){if(!d||!E)return;n.value="",a.appendChild(c("user",g)),a.scrollTop=a.scrollHeight,l.disabled=!0;const p=S();a.appendChild(p),a.scrollTop=a.scrollHeight;const x=o;try{const h=await L(r,d,x,{isSuggestion:w});if(o!==x)return;p.remove(),a.appendChild(c("bot",h.answer,h.sources||[],{onSuggestion:(W,z)=>k(W,z,{isSuggestion:!0})},h.suggestions||[]))}catch(h){if(o!==x)return;p.remove(),a.appendChild(c("bot",h.message||"Unable to send message."))}finally{l.disabled=!1,a.scrollTop=a.scrollHeight}}i.addEventListener("click",()=>t.classList.toggle("ragw-open")),m.addEventListener("click",()=>{o=C(r.companyId),a.replaceChildren(c("bot",r.greeting||"Hi, how can I help?")),n.value="",n.focus()}),b.addEventListener("click",()=>t.classList.remove("ragw-open")),s.addEventListener("submit",async d=>{d.preventDefault(),await k(n.value.trim())}),document.body.appendChild(t);async function H(){const d=S();a.appendChild(d);try{const g=await M(r,o);d.remove();const w=Array.isArray(g.messages)?g.messages:[];if(!w.length){a.appendChild(c("bot",r.greeting||"Hi, how can I help?"));return}for(const p of w)a.appendChild(c(p.role,p.content,p.sources||[]))}catch(g){d.remove(),console.warn("[RAG Widget] Unable to restore chat history",g),a.appendChild(c("bot","I couldn't load your earlier messages, but you can start a new chat here."))}finally{E=!0,n.disabled=!1,l.disabled=!1,a.scrollTop=a.scrollHeight}}H()}window.RAGChatWidget={init:f},((I=window.RAG_CHAT_WIDGET)==null?void 0:I.autoInit)!==!1&&(document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>f()):f())})();
