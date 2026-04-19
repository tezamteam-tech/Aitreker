import{f as X,r as a,j as t}from"./index-C6pWf9Kr.js";import{S as M}from"./star-kuhdXei1.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=[["path",{d:"M12 20h9",key:"t2du7b"}],["path",{d:"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z",key:"1ykcvy"}]],F=X("pen-line",R);function V({value:e,duration:r=800,className:l="text-white",style:m,glow:n=!0,glowColor:o="rgba(250, 204, 21, 0.4)"}){const[h,f]=a.useState(e),[i,u]=a.useState(!1),[s,w]=a.useState(0),x=a.useRef(e),c=a.useRef(0);return a.useEffect(()=>{const p=x.current;if(x.current=e,p===e)return;const j=e-p;w(j),u(!0);const S=performance.now(),d=p,y=e,b=v=>{const k=v-S,g=Math.min(k/r,1),N=1-Math.pow(1-g,3),A=Math.round(d+(y-d)*N);f(A),g<1?c.current=requestAnimationFrame(b):(f(y),setTimeout(()=>u(!1),600))};return c.current=requestAnimationFrame(b),()=>{c.current&&cancelAnimationFrame(c.current)}},[e,r]),t.jsxs("span",{className:`relative inline-flex items-center ${l}`,style:m,children:[n&&i&&t.jsx("span",{className:"absolute inset-0 rounded-full pointer-events-none animate-xp-glow",style:{background:`radial-gradient(circle, ${o} 0%, transparent 70%)`,filter:"blur(8px)"}}),t.jsx("span",{className:i?"animate-xp-bump":"",style:i&&s>0?{color:"#facc15"}:void 0,children:h.toLocaleString()}),i&&s!==0&&t.jsx("span",{className:"absolute -right-3 -top-1 pointer-events-none whitespace-nowrap animate-xp-float",style:{fontSize:"0.625rem",fontWeight:700,color:s>0?"#facc15":"#f87171"},children:s>0?`+${s}`:s}),t.jsx("style",{children:`
        @keyframes xp-glow {
          0% { opacity: 0; transform: scale(0.8); }
          50% { opacity: 0.6; transform: scale(1.6); }
          100% { opacity: 0; transform: scale(2); }
        }
        @keyframes xp-bump {
          0% { transform: scale(1); }
          30% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes xp-float {
          0% { opacity: 0; transform: translateY(4px) translateX(4px) scale(0.5); }
          30% { opacity: 1; transform: translateY(-12px) translateX(8px) scale(1); }
          100% { opacity: 0; transform: translateY(-24px) translateX(8px) scale(0.7); }
        }
        .animate-xp-glow { animation: xp-glow 0.8s ease-out forwards; }
        .animate-xp-bump { animation: xp-bump 0.5s ease-out; }
        .animate-xp-float { animation: xp-float 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
      `})]})}function L({xp:e,children:r}){const[l,m]=a.useState(e),[n,o]=a.useState(!1);return a.useEffect(()=>{e>l&&(o(!0),setTimeout(()=>o(!1),1200)),m(e)},[e]),t.jsxs("div",{className:"relative text-center overflow-visible",children:[n&&t.jsx("div",{className:"absolute inset-0 rounded-xl pointer-events-none animate-xp-ring",style:{border:"2px solid rgba(250, 204, 21, 0.3)"}}),t.jsxs("div",{className:n?"animate-xp-card-bump":"",children:[t.jsx(M,{className:"w-5 h-5 text-yellow-400 mx-auto mb-1"}),t.jsx(V,{value:e,style:{fontSize:"1.25rem",fontWeight:700},glowColor:"rgba(250, 204, 21, 0.35)"})]}),r,t.jsx("style",{children:`
        @keyframes xp-ring {
          0% { opacity: 0.5; transform: scale(0.3); }
          100% { opacity: 0; transform: scale(2.5); }
        }
        @keyframes xp-card-bump {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .animate-xp-ring { animation: xp-ring 0.8s ease-out forwards; }
        .animate-xp-card-bump { animation: xp-card-bump 0.3s ease-out; }
      `})]})}export{V as A,F as P,L as X};
