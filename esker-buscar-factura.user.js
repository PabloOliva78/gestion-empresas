// ==UserScript==
// @name         Herogra · buscar factura en Esker
// @namespace    herogra-impuestos
// @version      1.1
// @description  Al abrir Esker desde la aplicación de impuestos (botón 🔎 Esker), filtra la factura y abre su ficha con el PDF.
// @match        https://as1.ondemand.esker.com/ondemand/webaccess/ase/documents.aspx*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function(){
  'use strict';
  var K='hgAbrirFactura';
  function abrir(){
    var num=sessionStorage.getItem(K); if(!num) return;
    var n=0, t=setInterval(function(){
      n++;
      var ls=[].slice.call(document.querySelectorAll('a[href*="FlexibleForm"]')).filter(function(a){ return a.innerText.trim()===num; });
      if(ls.length){ clearInterval(t); sessionStorage.removeItem(K); if(ls.length===1) ls[0].click(); return; }
      if(n>40){ clearInterval(t); sessionStorage.removeItem(K); }
    },250);
  }
  function buscar(){
    var m=location.hash.match(/hgfac=([^&]+)/); if(!m) return;
    var num=decodeURIComponent(m[1]);
    history.replaceState(null,'',location.pathname+location.search);
    var n=0, t=setInterval(function(){
      n++;
      var sel=[].slice.call(document.querySelectorAll('select[id$="_ddl1"]')).filter(function(s){ var o=s.options[s.selectedIndex]; return o && /N[uú]mero de factura/i.test(o.text); })[0];
      if(!sel){ if(n>60) clearInterval(t); return; }
      clearInterval(t);
      var base=sel.id.replace(/_ddl1$/,''), ed=document.getElementById(base+'_edit'), ch=document.getElementById(base+'_chk0'), ap=document.getElementById('tpl_ih_adminList_displayedFilters_applyBtn');
      if(!ed) return;
      ed.value=num; ed.dispatchEvent(new Event('input',{bubbles:true})); ed.dispatchEvent(new Event('change',{bubbles:true}));
      if(ch && !ch.checked) ch.click();
      sessionStorage.setItem(K,num);
      if(ap) ap.click();
      setTimeout(abrir,1500);
    },250);
  }
  abrir(); buscar(); window.addEventListener('hashchange',buscar);
})();
