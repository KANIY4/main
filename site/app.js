
(function(){
  "use strict";
  var D2R=Math.PI/180, R2D=180/Math.PI, reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  var rev=function(x){return ((x%360)+360)%360;};

  function julian(date){ return date.getTime()/86400000 + 2440587.5; }
  function gmst(jd){ var d=jd-2451545.0; return rev(280.46061837 + 360.98564736629*d); }
  function lstf(jd,lon){ return rev(gmst(jd)+lon); }
  function altaz(ra,dec,latDeg,lstDeg){
    var H=rev(lstDeg-ra)*D2R, dc=dec*D2R, lat=latDeg*D2R;
    var sinAlt=Math.sin(dc)*Math.sin(lat)+Math.cos(dc)*Math.cos(lat)*Math.cos(H);
    var alt=Math.asin(Math.max(-1,Math.min(1,sinAlt)));
    var sinAz=-Math.cos(dc)*Math.sin(H)/Math.cos(alt);
    var cosAz=(Math.sin(dc)-Math.sin(lat)*sinAlt)/(Math.cos(lat)*Math.cos(alt));
    return { alt:alt*R2D, az:rev(Math.atan2(sinAz,cosAz)*R2D) };
  }
  function sun(jd){
    var n=jd-2451545.0, L=rev(280.460+0.9856474*n), g=rev(357.528+0.9856003*n)*D2R;
    var lam=(L+1.915*Math.sin(g)+0.020*Math.sin(2*g))*D2R, eps=(23.439-0.0000004*n)*D2R;
    return { ra:rev(Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam))*R2D), dec:Math.asin(Math.sin(eps)*Math.sin(lam))*R2D, lon:rev(lam*R2D) };
  }
  function moon(jd){
    var d=jd-2451543.5;
    var N=(125.1228-0.0529538083*d)*D2R, i=5.1454*D2R, w=(318.0634+0.1643573223*d)*D2R;
    var a=60.2666, e=0.054900, M=rev(115.3654+13.0649929509*d)*D2R;
    var E=M+e*Math.sin(M)*(1+e*Math.cos(M)), k;
    for(k=0;k<5;k++){ E=E-(E-e*Math.sin(E)-M)/(1-e*Math.cos(E)); }
    var xv=a*(Math.cos(E)-e), yv=a*Math.sqrt(1-e*e)*Math.sin(E);
    var v=Math.atan2(yv,xv), r=Math.sqrt(xv*xv+yv*yv);
    var xh=r*(Math.cos(N)*Math.cos(v+w)-Math.sin(N)*Math.sin(v+w)*Math.cos(i));
    var yh=r*(Math.sin(N)*Math.cos(v+w)+Math.cos(N)*Math.sin(v+w)*Math.cos(i));
    var zh=r*(Math.sin(v+w)*Math.sin(i));
    var lonEcl=Math.atan2(yh,xh), latEcl=Math.atan2(zh,Math.sqrt(xh*xh+yh*yh));
    var s=sun(jd), ecl=(23.4393-3.563e-7*d)*D2R;
    var xe=Math.cos(lonEcl)*Math.cos(latEcl), ye=Math.sin(lonEcl)*Math.cos(latEcl), ze=Math.sin(latEcl);
    var xq=xe, yq=ye*Math.cos(ecl)-ze*Math.sin(ecl), zq=ye*Math.sin(ecl)+ze*Math.cos(ecl);
    var elong=rev(lonEcl*R2D-s.lon);
    return { ra:rev(Math.atan2(yq,xq)*R2D), dec:Math.atan2(zq,Math.sqrt(xq*xq+yq*yq))*R2D, illum:(1-Math.cos(elong*D2R))/2, waxing:elong<180 };
  }
  var PEL={ Mercury:[[48.3313,3.24587e-5],[7.0047,5.00e-8],[29.1241,1.01444e-5],[0.387098,0],[0.205635,5.59e-10],[168.6562,4.0923344368]],
    Venus:[[76.6799,2.46590e-5],[3.3946,2.75e-8],[54.8910,1.38374e-5],[0.723330,0],[0.006773,-1.302e-9],[48.0052,1.6021302244]],
    Mars:[[49.5574,2.11081e-5],[1.8497,-1.78e-8],[286.5016,2.92961e-5],[1.523688,0],[0.093405,2.516e-9],[18.6021,0.5240207766]],
    Jupiter:[[100.4542,2.76854e-5],[1.3030,-1.557e-7],[273.8777,1.64505e-5],[5.20256,0],[0.048498,4.469e-9],[19.8950,0.0830853001]],
    Saturn:[[113.6634,2.38980e-5],[2.4886,-1.081e-7],[339.3939,2.97661e-5],[9.55475,0],[0.055546,-9.499e-9],[316.9670,0.0334442282]] };
  function planet(name,jd){
    var d=jd-2451543.5, el=PEL[name];
    var N=(el[0][0]+el[0][1]*d)*D2R, i=(el[1][0]+el[1][1]*d)*D2R, w=(el[2][0]+el[2][1]*d)*D2R;
    var a=el[3][0]+el[3][1]*d, e=el[4][0]+el[4][1]*d, M=rev(el[5][0]+el[5][1]*d)*D2R, E=M+e*Math.sin(M)*(1+e*Math.cos(M)), k;
    for(k=0;k<8;k++){ E=E-(E-e*Math.sin(E)-M)/(1-e*Math.cos(E)); }
    var xv=a*(Math.cos(E)-e), yv=a*Math.sqrt(1-e*e)*Math.sin(E), v=Math.atan2(yv,xv), r=Math.sqrt(xv*xv+yv*yv);
    var xh=r*(Math.cos(N)*Math.cos(v+w)-Math.sin(N)*Math.sin(v+w)*Math.cos(i));
    var yh=r*(Math.sin(N)*Math.cos(v+w)+Math.cos(N)*Math.sin(v+w)*Math.cos(i));
    var zh=r*(Math.sin(v+w)*Math.sin(i));
    var s=sun(jd), n=jd-2451545.0, g=rev(357.528+0.9856003*n)*D2R;
    var rs=1.00014-0.01671*Math.cos(g)-0.00014*Math.cos(2*g);
    var xs=rs*Math.cos(s.lon*D2R), ys=rs*Math.sin(s.lon*D2R);
    var xg=xh+xs, yg=yh+ys, zg=zh, ecl=(23.4393-3.563e-7*d)*D2R;
    var xe=xg, ye=yg*Math.cos(ecl)-zg*Math.sin(ecl), ze=yg*Math.sin(ecl)+zg*Math.cos(ecl);
    return { ra:rev(Math.atan2(ye,xe)*R2D), dec:Math.atan2(ze,Math.sqrt(xe*xe+ye*ye))*R2D };
  }
  function raHMS(ra){ var h=ra/15, hh=Math.floor(h), mf=(h-hh)*60, mm=Math.floor(mf), ss=Math.round((mf-mm)*60);
    if(ss===60){ss=0;mm++;} if(mm===60){mm=0;hh++;} return String(hh).padStart(2,"0")+"h "+String(mm).padStart(2,"0")+"m "+String(ss).padStart(2,"0")+"s"; }
  function decDMS(dec){ var s=dec<0?"−":"+", a=Math.abs(dec), dd=Math.floor(a), mf=(a-dd)*60, mm=Math.floor(mf), ss=Math.round((mf-mm)*60);
    if(ss===60){ss=0;mm++;} if(mm===60){mm=0;dd++;} return s+String(dd).padStart(2,"0")+"° "+String(mm).padStart(2,"0")+"′ "+String(ss).padStart(2,"0")+"″"; }

  var STAR_URL="https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/stars.6.json";
  var LINE_URL="https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/constellations.lines.json";
  var CN={And:"Andromeda",Ant:"Antlia",Aps:"Apus",Aql:"Aquila",Aqr:"Aquarius",Ara:"Ara",Ari:"Aries",Aur:"Auriga",Boo:"Boötes",Cae:"Caelum",Cam:"Camelopardalis",Cap:"Capricornus",Car:"Carina",Cas:"Cassiopeia",Cen:"Centaurus",Cep:"Cepheus",Cet:"Cetus",Cha:"Chamaeleon",Cir:"Circinus",CMa:"Canis Major",CMi:"Canis Minor",Cnc:"Cancer",Col:"Columba",Com:"Coma Berenices",CrA:"Corona Australis",CrB:"Corona Borealis",Crt:"Crater",Cru:"Crux",Crv:"Corvus",CVn:"Canes Venatici",Cyg:"Cygnus",Del:"Delphinus",Dor:"Dorado",Dra:"Draco",Equ:"Equuleus",Eri:"Eridanus",For:"Fornax",Gem:"Gemini",Gru:"Grus",Her:"Hercules",Hor:"Horologium",Hya:"Hydra",Hyi:"Hydrus",Ind:"Indus",Lac:"Lacerta",Leo:"Leo",Lep:"Lepus",Lib:"Libra",LMi:"Leo Minor",Lup:"Lupus",Lyn:"Lynx",Lyr:"Lyra",Men:"Mensa",Mic:"Microscopium",Mon:"Monoceros",Mus:"Musca",Nor:"Norma",Oct:"Octans",Oph:"Ophiuchus",Ori:"Orion",Pav:"Pavo",Peg:"Pegasus",Per:"Perseus",Phe:"Phoenix",Pic:"Pictor",PsA:"Piscis Austrinus",Psc:"Pisces",Pup:"Puppis",Pyx:"Pyxis",Ret:"Reticulum",Scl:"Sculptor",Sco:"Scorpius",Sct:"Scutum",Ser:"Serpens",Sex:"Sextans",Sge:"Sagitta",Sgr:"Sagittarius",Tau:"Taurus",Tel:"Telescopium",TrA:"Triangulum Australe",Tri:"Triangulum",Tuc:"Tucana",UMa:"Ursa Major",UMi:"Ursa Minor",Vel:"Vela",Vir:"Virgo",Vol:"Volans",Vul:"Vulpecula"};
  var stars=[], clines=[], dataReady=false;
  var NAMED=[ ["Sirius",101.287,-16.716,-1.46],["Canopus",95.988,-52.696,-0.74],["Arcturus",213.915,19.182,-0.05],
    ["Vega",279.234,38.784,0.03],["Capella",79.172,45.998,0.08],["Rigel",78.634,-8.202,0.13],
    ["Procyon",114.825,5.225,0.34],["Betelgeuse",88.793,7.407,0.42],["Altair",297.696,8.868,0.77],
    ["Aldebaran",68.980,16.509,0.85],["Antares",247.352,-26.432,1.09],["Spica",201.298,-11.161,1.04],
    ["Pollux",116.329,28.026,1.14],["Fomalhaut",344.413,-29.622,1.16],["Deneb",310.358,45.280,1.25],
    ["Regulus",152.093,11.967,1.35],["Castor",113.650,31.888,1.58],["Polaris",37.954,89.264,1.98] ];
  var PLANETS=[["Mercury","#cdd3e0"],["Venus","#fff3d6"],["Mars","#ff6a4d"],["Jupiter","#f5c26b"],["Saturn","#ffd9a3"]];
  var STARDIST={Sirius:8.6,Canopus:310,Arcturus:37,Vega:25,Capella:43,Rigel:860,Procyon:11,Betelgeuse:640,Altair:17,Aldebaran:65,Antares:550,Spica:250,Pollux:34,Fomalhaut:25,Deneb:2600,Regulus:79,Castor:51,Polaris:433};
  // famous deep-sky objects: name, ra(deg), dec(deg), type, mag, note
  var DSO=[
    ["M31 Andromeda Galaxy",10.68,41.27,"galaxy",3.4,"Nearest large spiral · 2.5M light-years"],
    ["M42 Orion Nebula",83.85,-5.45,"nebula",4.0,"Stellar nursery · 1,344 ly"],
    ["M45 Pleiades",56.75,24.12,"cluster",1.6,"Seven Sisters · open cluster"],
    ["M13 Hercules Cluster",250.42,36.47,"cluster",5.8,"Great globular cluster"],
    ["M57 Ring Nebula",283.4,33.03,"nebula",8.8,"Planetary nebula in Lyra"],
    ["M27 Dumbbell Nebula",299.9,22.72,"nebula",7.4,"Planetary nebula in Vulpecula"],
    ["M8 Lagoon Nebula",270.95,-24.38,"nebula",6.0,"Emission nebula in Sagittarius"],
    ["M51 Whirlpool Galaxy",202.47,47.2,"galaxy",8.4,"Face-on spiral · 23M ly"],
    ["M81 Bode's Galaxy",148.9,69.07,"galaxy",6.9,"Grand-design spiral"],
    ["M104 Sombrero Galaxy",190.0,-11.62,"galaxy",8.0,"Edge-on with dust lane"],
    ["M1 Crab Nebula",83.63,22.02,"nebula",8.4,"Supernova remnant · AD 1054"],
    ["M44 Beehive Cluster",130.1,19.98,"cluster",3.7,"Open cluster in Cancer"],
    ["M16 Eagle Nebula",274.7,-13.78,"nebula",6.0,"Pillars of Creation"],
    ["M22 Sagittarius Cluster",279.1,-23.9,"cluster",5.1,"Bright globular cluster"],
    ["M7 Ptolemy Cluster",268.48,-34.82,"cluster",3.3,"Open cluster in Scorpius"]
  ];
  var FACTS={ Sun:["Star · G2V","1,392,700 km across","~5,778 K surface","Our home star"],
    Mercury:["Planet","4,879 km across","0.39 AU from Sun","A day lasts 59 Earth days"],
    Venus:["Planet","12,104 km across","0.72 AU from Sun","Hottest planet · 465°C"],
    Mars:["Planet","6,779 km across","1.52 AU from Sun","The Red Planet"],
    Jupiter:["Planet","139,820 km across","5.20 AU from Sun","Largest planet · 90+ moons"],
    Saturn:["Planet","116,460 km across","9.58 AU from Sun","Ringed gas giant"],
    Moon:["Satellite","3,474 km across","384,400 km away","Earth's only moon"] };
  var highlight=null, currentDetail=null;

  /* live ISS tracking */
  var ISS={lat:0,lon:0,altkm:408,vel:0,vis:"",ok:false}, issPt=null;
  function lookAngleISS(latDeg,lonDeg,satLatDeg,satLonDeg,satAltKm){
    var Re=6378.137;
    function toECEF(latD,lonD,altKm){ var lat=latD*D2R, lon=lonD*D2R, r=Re+altKm;
      return [r*Math.cos(lat)*Math.cos(lon), r*Math.cos(lat)*Math.sin(lon), r*Math.sin(lat)]; }
    var obs=toECEF(latDeg,lonDeg,0), sat=toECEF(satLatDeg,satLonDeg,satAltKm);
    var dx=sat[0]-obs[0], dy=sat[1]-obs[1], dz=sat[2]-obs[2], lat=latDeg*D2R, lon=lonDeg*D2R;
    var east=-Math.sin(lon)*dx+Math.cos(lon)*dy;
    var north=-Math.sin(lat)*Math.cos(lon)*dx-Math.sin(lat)*Math.sin(lon)*dy+Math.cos(lat)*dz;
    var up=Math.cos(lat)*Math.cos(lon)*dx+Math.cos(lat)*Math.sin(lon)*dy+Math.sin(lat)*dz;
    var range=Math.sqrt(east*east+north*north+up*up);
    return { alt:Math.asin(up/range)*R2D, az:rev(Math.atan2(east,north)*R2D) };
  }
  function fetchISS(){
    fetch("https://api.wheretheiss.at/v1/satellites/25544").then(function(r){return r.json();}).then(function(d){
      ISS.lat=d.latitude; ISS.lon=d.longitude; ISS.altkm=d.altitude; ISS.vel=d.velocity; ISS.vis=d.visibility; ISS.ok=true;
      dirty=true; renderTrack();
    }).catch(function(){});
  }

  function loadData(){
    return Promise.all([ fetch(STAR_URL).then(function(r){return r.json();}), fetch(LINE_URL).then(function(r){return r.json();}) ])
    .then(function(res){
      res[0].features.forEach(function(f){ var m=f.properties.mag; if(m>5.2) return; var c=f.geometry.coordinates; stars.push([c[0],c[1],m]); });
      res[1].features.forEach(function(f){ var id=f.id; f.geometry.coordinates.forEach(function(seg){ var pl=[]; seg.forEach(function(p){pl.push([p[0],p[1]]);}); clines.push({id:id,pts:pl}); }); });
      dataReady=true;
    });
  }

  var root=document.documentElement, tbtn=document.getElementById("themeBtn"), ticon=document.getElementById("themeIcon");
  var SUNI='<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>';
  var MOONI='<path d="M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>';
  function themeNow(){ return root.getAttribute("data-theme")||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"); }
  function paintIcon(){ ticon.innerHTML=themeNow()==="dark"?SUNI:MOONI; }
  paintIcon();
  tbtn.addEventListener("click",function(){ root.setAttribute("data-theme",themeNow()==="dark"?"light":"dark"); paintIcon(); dirty=true; });

  var state={lat:40.7128, lon:-74.0060, label:"New York (default)"};
  var timeOffset=0, animating=false, rotOffset=0, dirty=true;
  var coordLine=document.getElementById("coordLine"), locStatus=document.getElementById("locStatus"),
      logSite=document.getElementById("logSite"), manual=document.getElementById("manual"),
      tip=document.getElementById("tip"), detail=document.getElementById("detail"), detailBody=document.getElementById("detailBody"),
      tlabel=document.getElementById("tlabel"), periodBadge=document.getElementById("periodBadge"), timeSlider=document.getElementById("timeSlider");
  function nowDate(){ return new Date(Date.now()+timeOffset*60000); }
  function fmtLat(v){ return Math.abs(v).toFixed(2)+"°"+(v>=0?"N":"S"); }
  function fmtLon(v){ return Math.abs(v).toFixed(2)+"°"+(v>=0?"E":"W"); }
  function setLoc(lat,lon,label,note){ state.lat=lat; state.lon=lon; state.label=label||(fmtLat(lat)+" "+fmtLon(lon));
    logSite.textContent="site — "+state.label.toLowerCase(); if(note) locStatus.innerHTML=note; dirty=true; updatePanels(); }
  function locate(){
    if(!navigator.geolocation){ locStatus.innerHTML="No geolocation. Enter coordinates:"; manual.classList.add("show"); return; }
    locStatus.innerHTML="Locating…";
    navigator.geolocation.getCurrentPosition(function(p){ setLoc(p.coords.latitude,p.coords.longitude,null,"Your location · <b>±"+Math.round(p.coords.accuracy)+" m</b>"); },
      function(){ locStatus.innerHTML="Permission denied — showing default. Enter coordinates:"; manual.classList.add("show"); },
      {enableHighAccuracy:false,timeout:9000,maximumAge:600000});
  }
  document.getElementById("locBtn").addEventListener("click",locate);
  document.getElementById("locBtn2").addEventListener("click",locate);
  document.getElementById("setBtn").addEventListener("click",function(){
    var la=parseFloat(document.getElementById("latIn").value), lo=parseFloat(document.getElementById("lonIn").value);
    if(isFinite(la)&&isFinite(lo)&&Math.abs(la)<=90&&Math.abs(lo)<=180) setLoc(la,lo,null,"Manual · <b>set</b>");
    else locStatus.innerHTML="Enter valid lat (−90..90) and lon (−180..180).";
  });
  var linesToggle=document.getElementById("linesToggle"), showLines=true;
  linesToggle.addEventListener("change",function(){ showLines=linesToggle.checked; });

  // time controls
  function updateTimeLabel(){
    if(timeOffset===0 && !animating){ tlabel.textContent="live · now"; return; }
    var d=nowDate(), hh=String(d.getHours()).padStart(2,"0"), mm=String(d.getMinutes()).padStart(2,"0");
    var sign=timeOffset>=0?"+":"−", am=Math.abs(timeOffset), h=Math.floor(am/60), m=Math.round(am%60);
    tlabel.textContent=hh+":"+mm+" ("+sign+h+"h"+(m?m+"m":"")+")";
  }
  timeSlider.addEventListener("input",function(){ timeOffset=+timeSlider.value; animating=false; document.getElementById("playBtn").textContent="▶"; dirty=true; updateTimeLabel(); updatePanels(); });
  document.getElementById("nowBtn").addEventListener("click",function(){ timeOffset=0; animating=false; timeSlider.value=0; document.getElementById("playBtn").textContent="▶"; dirty=true; updateTimeLabel(); updatePanels(); });
  document.getElementById("playBtn").addEventListener("click",function(){ animating=!animating; this.textContent=animating?"⏸":"▶"; });
  document.getElementById("resetView").addEventListener("click",function(){ rotOffset=0; dirty=true; });
  var pageEl=document.querySelector(".page"), heroIn=document.querySelector(".hero-in"), fsBtn=document.getElementById("fsBtn");
  function setImmersive(on){
    pageEl.classList.toggle("immersive",on);
    fsBtn.textContent = on ? "⤡" : "⛶";
    fsBtn.title = on ? "Exit full view" : "Full view";
    if(on) hudShow(); else { clearTimeout(hudTimer); heroIn.classList.remove("hud-idle"); }
    setTimeout(resize,60);
  }
  fsBtn.addEventListener("click",function(){
    var go=function(){
      if(!document.fullscreenElement){ (document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen||function(){}).call(document.documentElement); setImmersive(true); }
      else { (document.exitFullscreen||document.webkitExitFullscreen||function(){}).call(document); setImmersive(false); }
    };
    if(document.startViewTransition) document.startViewTransition(go); else go();
  });
  document.addEventListener("fullscreenchange",function(){ if(!document.fullscreenElement) setImmersive(false); setTimeout(resize,60); });
  var hudTimer=null;
  function hudShow(){ heroIn.classList.remove("hud-idle"); clearTimeout(hudTimer);
    if(pageEl.classList.contains("immersive")) hudTimer=setTimeout(function(){ heroIn.classList.add("hud-idle"); },3200); }
  ["pointermove","pointerdown","keydown"].forEach(function(ev){ document.addEventListener(ev,function(){ if(pageEl.classList.contains("immersive")) hudShow(); }); });

  var canvas=document.getElementById("sky"), ctx=canvas.getContext("2d");
  var W=0,H=0,cx=0,cy=0,RAD=0,DPR=Math.min(devicePixelRatio||1,2);
  var mouse={x:-1e4,y:-1e4,on:false}, t=0;
  var starPts=[], lineSegs=[], bodyPts=[], hoverStars=[];
  var sky={top:"#0b1026",hor:"#0b1026",starK:1}; // sky palette

  function col(name){ return getComputedStyle(root).getPropertyValue(name).trim(); }
  function lerp(a,b,f){ return a+(b-a)*f; }
  function mix(c1,c2,f){ // hex mix
    var a=parseInt(c1.slice(1),16), b=parseInt(c2.slice(1),16);
    var r=Math.round(lerp((a>>16)&255,(b>>16)&255,f)), g=Math.round(lerp((a>>8)&255,(b>>8)&255,f)), bl=Math.round(lerp(a&255,b&255,f));
    return "rgb("+r+","+g+","+bl+")";
  }
  // sky colour + period from sun altitude and local hour
  function skyPalette(sunAlt, hour){
    var period, top, hor, starK, dark=themeNow()==="dark";
    if(hour>=5&&hour<11)period="Morning"; else if(hour>=11&&hour<15)period="Noon";
    else if(hour>=15&&hour<18)period="Afternoon"; else if(hour>=18&&hour<21)period="Evening"; else period="Night";
    // brightness driven by sun altitude
    if(sunAlt>6){ // full day
      var warm = (period==="Afternoon"||period==="Evening");
      top = warm? "#3f74b8":"#3f80cc"; hor = period==="Evening"? "#e9b27a": (period==="Afternoon"? "#cfe0f2":"#bcdcff");
      starK=0.12;
    } else if(sunAlt>0){ top="#2a4e86"; hor=(hour<12?"#7fb0e6":"#e6a878"); starK=0.3; }
    else if(sunAlt>-6){ top="#152346"; hor=(hour<12?"#3f5f96":"#b06a4a"); starK=0.6; } // civil twilight
    else if(sunAlt>-12){ top="#0d1636"; hor=(hour<12?"#24365f":"#5a3a4a"); starK=0.85; } // nautical
    else if(sunAlt>-18){ top="#0a1030"; hor="#141a38"; starK=0.95; } // astro twilight
    else { top="#070c22"; hor="#0c1330"; starK=1; } // night
    if(!dark){ // light theme: keep pale atlas paper, ignore day tint darkening
      top="#d7e0ef"; hor="#c3d2e8"; starK=1;
    }
    return {period:period, top:top, hor:hor, starK:starK};
  }

  function proj(ra,dec,lst,lat){
    var p=altaz(ra,dec,lat,lst), r=(1-p.alt/90)*RAD, ang=(p.az+rotOffset)*D2R;
    return { x:cx - r*Math.sin(ang), y:cy - r*Math.cos(ang), alt:p.alt, az:p.az };
  }
  function resize(){
    var hero=canvas.parentElement; W=hero.clientWidth; H=hero.clientHeight;
    canvas.width=W*DPR; canvas.height=H*DPR; canvas.style.width=W+"px"; canvas.style.height=H+"px";
    ctx.setTransform(DPR,0,0,DPR,0,0);
    cx=W*0.5; cy=H*0.5; RAD=Math.hypot(W,H)/2; dirty=true;
  }
  function compass(az){ return ["N","NE","E","SE","S","SW","W","NW"][Math.round(az/45)%8]; }

  // light recompute (positions) — called each dirty/animating frame
  function computePositions(){
    if(!dataReady) return;
    var now=nowDate(), jd=julian(now), lst=lstf(jd,state.lon), lat=state.lat, i, p;
    starPts.length=0;
    for(i=0;i<stars.length;i++){ p=proj(stars[i][0],stars[i][1],lst,lat); if(p.alt>-0.5){ p.mag=stars[i][2]; starPts.push(p); } }
    lineSegs.length=0;
    for(i=0;i<clines.length;i++){ var pl=clines[i].pts, id=clines[i].id;
      for(var j=0;j<pl.length-1;j++){ var a=proj(pl[j][0],pl[j][1],lst,lat), b=proj(pl[j+1][0],pl[j+1][1],lst,lat);
        if(a.alt>0 && b.alt>0) lineSegs.push([a.x,a.y,b.x,b.y,id]); } }
    bodyPts.length=0;
    var s=sun(jd), sp=altaz(s.ra,s.dec,lat,lst);
    if(sp.alt>-2){ var q=proj(s.ra,s.dec,lst,lat); bodyPts.push({x:q.x,y:q.y,alt:sp.alt,az:sp.az,ra:s.ra,dec:s.dec,kind:"sun",label:"Sun",sub:"The Sun",color:col("--accent"),rad:9}); }
    var mo=moon(jd), mp=altaz(mo.ra,mo.dec,lat,lst);
    if(mp.alt>-2){ var mq=proj(mo.ra,mo.dec,lst,lat); bodyPts.push({x:mq.x,y:mq.y,alt:mp.alt,az:mp.az,ra:mo.ra,dec:mo.dec,kind:"moon",label:"Moon",sub:Math.round(mo.illum*100)+"% lit",illum:mo.illum,rad:7}); }
    PLANETS.forEach(function(pl){ var pos=planet(pl[0],jd), pa=altaz(pos.ra,pos.dec,lat,lst);
      if(pa.alt>-0.5){ var pq=proj(pos.ra,pos.dec,lst,lat); bodyPts.push({x:pq.x,y:pq.y,alt:pa.alt,az:pa.az,ra:pos.ra,dec:pos.dec,kind:"planet",label:pl[0],sub:"Planet",color:pl[1],rad:4}); } });
    hoverStars.length=0;
    NAMED.forEach(function(n){ var pa=altaz(n[1],n[2],lat,lst); if(pa.alt>-0.5){ var pq=proj(n[1],n[2],lst,lat); hoverStars.push({x:pq.x,y:pq.y,name:n[0],mag:n[3],alt:pa.alt,az:pa.az,ra:n[1],dec:n[2]}); } });
    issPt=null;
    if(ISS.ok){ var ila=lookAngleISS(lat,state.lon,ISS.lat,ISS.lon,ISS.altkm);
      if(ila.alt>-2){ var iang=(ila.az+rotOffset)*D2R, ir=(1-ila.alt/90)*RAD; issPt={x:cx-ir*Math.sin(iang), y:cy-ir*Math.cos(iang), alt:ila.alt, az:ila.az}; } }
    sky=skyPalette(sp.alt, now.getHours()); periodBadge.textContent=sky.period;
    updateClock(now);
    window.__diag={stars:starPts.length,segs:lineSegs.length,bodies:bodyPts.length,named:hoverStars.length,period:sky.period,rot:Math.round(rotOffset),off:timeOffset,
      b0:bodyPts[0]?{x:bodyPts[0].x,y:bodyPts[0].y,label:bodyPts[0].label}:null,
      s0:(function(){var h=hoverStars.slice().sort(function(a,b){return b.alt-a.alt;})[0];return h?{x:h.x,y:h.y,name:h.name}:null;})(),
      seg0:lineSegs[0]?{x:(lineSegs[0][0]+lineSegs[0][2])/2,y:(lineSegs[0][1]+lineSegs[0][3])/2,id:lineSegs[0][4]}:null};
  }

  function updateClock(now){
    var hh=String(now.getHours()).padStart(2,"0"), mm=String(now.getMinutes()).padStart(2,"0"), ss=String(now.getSeconds()).padStart(2,"0");
    coordLine.textContent=fmtLat(state.lat)+" · "+fmtLon(state.lon)+" · "+hh+":"+mm+":"+ss+" local";
  }
  function fmtTime(dt){ return String(dt.getHours()).padStart(2,"0")+":"+String(dt.getMinutes()).padStart(2,"0"); }
  // heavier panels
  function updatePanels(){
    if(!dataReady) return;
    var now=nowDate(), jd=julian(now), lst=lstf(jd,state.lon), lat=state.lat;
    var s=sun(jd), sp=altaz(s.ra,s.dec,lat,lst), mo=moon(jd), mp=altaz(mo.ra,mo.dec,lat,lst);
    var a=sp.alt, stateTxt;
    if(a>0)stateTxt="Daylight"; else if(a>-6)stateTxt="Civil dusk"; else if(a>-12)stateTxt="Nautical"; else if(a>-18)stateTxt="Astro twilight"; else stateTxt="Dark";
    document.getElementById("tNow").textContent=stateTxt; document.getElementById("tNowSub").textContent="sun "+a.toFixed(0)+"°";
    var endT=null,startT=null,prev=a;
    for(var m=5;m<=1440;m+=5){ var dt=new Date(now.getTime()+m*60000), js=julian(dt), ls=lstf(js,state.lon), su=sun(js), al=altaz(su.ra,su.dec,lat,ls).alt;
      if(endT===null&&prev>=-18&&al<-18)endT=dt; if(endT!==null&&startT===null&&prev<-18&&al>=-18)startT=dt; prev=al; }
    document.getElementById("tTwi").textContent=endT?fmtTime(endT):(a<-18?"in progress":"—");
    document.getElementById("tTwiSub").textContent=endT?"sun −18°":"no astro night";
    if(endT&&startT){ var mins=Math.round((startT-endT)/60000),h=Math.floor(mins/60),mm=mins%60;
      document.getElementById("tDark").textContent=fmtTime(endT)+" → "+fmtTime(startT); document.getElementById("tDarkSub").textContent=h+"h "+mm+"m of true dark";
    } else if(a<-18){ document.getElementById("tDark").textContent="now → "+(startT?fmtTime(startT):"dawn"); document.getElementById("tDarkSub").textContent="dark now";
    } else { document.getElementById("tDark").textContent="—"; document.getElementById("tDarkSub").textContent="none tonight (season/latitude)"; }
    var pct=Math.round(mo.illum*100), name;
    if(pct<3)name="New"; else if(pct<47)name=(mo.waxing?"Waxing":"Waning")+" crescent"; else if(pct<53)name=(mo.waxing?"First":"Last")+" quarter";
    else if(pct<97)name=(mo.waxing?"Waxing":"Waning")+" gibbous"; else name="Full";
    document.getElementById("tMoon").textContent=name+" · "+pct+"%"; document.getElementById("tMoonSub").textContent="illuminated";
    // whats up
    var items=[];
    PLANETS.forEach(function(pl){ var pos=planet(pl[0],jd), pa=altaz(pos.ra,pos.dec,lat,lst); if(pa.alt>0) items.push({sym:"●",color:pl[1],name:pl[0],sub:"Planet",type:"planet",alt:pa.alt,az:pa.az,ra:pos.ra,dec:pos.dec}); });
    if(mp.alt>0) items.push({sym:"☾",color:"var(--ink)",name:"Moon",sub:Math.round(mo.illum*100)+"% lit",type:"moon",alt:mp.alt,az:mp.az,ra:mo.ra,dec:mo.dec});
    NAMED.forEach(function(n){ var pa=altaz(n[1],n[2],lat,lst); if(pa.alt>0) items.push({sym:"★",color:"var(--accent)",name:n[0],sub:"Star · mag "+n[3].toFixed(1),type:"star",alt:pa.alt,az:pa.az,ra:n[1],dec:n[2],mag:n[3]}); });
    items.sort(function(x,y){return y.alt-x.alt;}); lastList=items; renderList();
  }

  var filter="all", listEl=document.getElementById("skyList"), lastList=[];
  function renderList(){
    var rows=lastList.filter(function(o){return filter==="all"||o.type===filter;});
    if(!rows.length){ listEl.innerHTML='<div class="empty">Nothing in this category is above the horizon right now.</div>'; return; }
    listEl.innerHTML=rows.map(function(o,ix){ return '<div class="obj" data-ix="'+ix+'"><span class="sym" style="color:'+o.color+'">'+o.sym+'</span>'
      +'<span class="name">'+o.name+'<small>'+o.sub+'</small></span>'
      +'<span class="coord">'+raHMS(o.ra).slice(0,7)+' · '+compass(o.az)+'</span>'
      +'<span class="alt"><span class="bar"><i style="width:'+Math.round(o.alt/90*100)+'%"></i></span><span class="deg">alt '+o.alt.toFixed(0)+'°</span></span></div>'; }).join("");
    [].forEach.call(listEl.querySelectorAll(".obj"),function(el){ el.addEventListener("click",function(){ var o=rows[+el.getAttribute("data-ix")];
      openDetail({title:o.name,kind:o.type==="planet"?"Planet":(o.type==="moon"?"Moon":"Star"),ra:o.ra,dec:o.dec,alt:o.alt,az:o.az,mag:o.mag,
        v3type:(o.type==="planet"?"planet:"+o.name:o.type),facts:(o.type==="planet"?FACTS[o.name]:(o.type==="moon"?FACTS.Moon:(STARDIST[o.name]?["Distance ~"+STARDIST[o.name]+" light-years"]:[])))}); }); });
  }
  [].forEach.call(document.querySelectorAll(".chip"),function(c){ c.addEventListener("click",function(){ filter=c.getAttribute("data-f");
    [].forEach.call(document.querySelectorAll(".chip"),function(x){x.setAttribute("aria-pressed",x===c?"true":"false");}); renderList(); }); });

  // detail panel
  function openDetail(o){
    var rows="";
    if(o.ra!=null){ rows+='<div class="drow"><span class="dk2">RA (J2000)</span><span class="dv">'+raHMS(o.ra)+'</span></div>';
      rows+='<div class="drow"><span class="dk2">Dec</span><span class="dv">'+decDMS(o.dec)+'</span></div>'; }
    if(o.alt!=null){ rows+='<div class="drow"><span class="dk2">Altitude</span><span class="dv">'+o.alt.toFixed(1)+'°</span></div>';
      rows+='<div class="drow"><span class="dk2">Azimuth</span><span class="dv">'+o.az.toFixed(1)+'° '+compass(o.az)+'</span></div>'; }
    if(o.mag!=null && isFinite(o.mag)) rows+='<div class="drow"><span class="dk2">Magnitude</span><span class="dv">'+o.mag.toFixed(1)+'</span></div>';
    var scope = o.alt!=null && o.ra!=null ? '<div class="scope">Point your scope: azimuth '+o.az.toFixed(0)+'° ('+compass(o.az)+'), altitude '+o.alt.toFixed(0)+'° above the horizon.</div>' : '';
    var facts = (o.facts||[]).map(function(f){return '<div class="scope" style="color:var(--ink-soft)">'+f+'</div>';}).join("");
    var btn3d = o.v3type ? '<button class="btn mini solid" id="view3dBtn" style="margin-top:.9rem; width:100%; justify-content:center">Fly to in 3D ↗</button>' : '';
    var explainUI='<button class="btn mini" id="explainBtn" style="margin-top:.8rem; width:100%; justify-content:center">✨ Explain this</button><div class="explain" id="explainOut"></div>';
    var cg=contextGear(o);
    var img=objImage(o);
    var thumb = img ? ('<img class="thumb" src="'+img+'" alt="" loading="lazy" onerror="this.remove()">') : '';
    currentDetail=o;
    detailBody.innerHTML=thumb+'<h3>'+o.title+'</h3><div class="dk">'+o.kind+'</div>'+rows+scope+facts+explainUI+cg+btn3d;
    detail.classList.add("show");
    var vb=document.getElementById("view3dBtn"); if(vb) vb.addEventListener("click",function(){ open3D(o); });
    var eb=document.getElementById("explainBtn"); if(eb) eb.addEventListener("click",function(){ explain(o); });
  }
  document.getElementById("detailClose").addEventListener("click",function(){ detail.classList.remove("show"); });

  // hover identify
  function segDist(px,py,x1,y1,x2,y2){ var dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy; if(l2===0)return Math.hypot(px-x1,py-y1);
    var tt=((px-x1)*dx+(py-y1)*dy)/l2; tt=Math.max(0,Math.min(1,tt)); return Math.hypot(px-(x1+tt*dx),py-(y1+tt*dy)); }
  function findHit(mx,my){
    var i;
    if(issPt && Math.hypot(mx-issPt.x,my-issPt.y)<14) return { title:"ISS", kind:"Satellite", alt:issPt.alt, az:issPt.az,
      facts:["Altitude ~"+Math.round(ISS.altkm)+" km","Speed ~"+Math.round(ISS.vel)+" km/h","Currently "+(ISS.vis||"—")] };
    for(i=0;i<bodyPts.length;i++){ var b=bodyPts[i]; if(Math.hypot(mx-b.x,my-b.y)<b.rad+11)
      return { title:b.label, kind:b.kind==="planet"?"Planet":(b.kind==="moon"?"Moon":"Sun"), ra:b.ra,dec:b.dec,alt:b.alt,az:b.az, v3type:(b.kind==="planet"?"planet:"+b.label:b.kind), facts:FACTS[b.label] }; }
    for(i=0;i<hoverStars.length;i++){ var st=hoverStars[i]; if(Math.hypot(mx-st.x,my-st.y)<11)
      return { title:st.name, kind:"Star", ra:st.ra,dec:st.dec,alt:st.alt,az:st.az,mag:st.mag, v3type:"star", facts:(STARDIST[st.name]?["Distance ~"+STARDIST[st.name]+" light-years"]:[]) }; }
    var best=null, bd=8;
    for(i=0;i<lineSegs.length;i++){ var s=lineSegs[i], dd=segDist(mx,my,s[0],s[1],s[2],s[3]); if(dd<bd){ bd=dd; best=s[4]; } }
    if(best) return { title:CN[best]||best, kind:"Constellation" };
    return null;
  }
  function showTip(mx,my,px,py){
    var h=findHit(mx,my);
    if(!h){ tip.classList.remove("show"); canvas.style.cursor=dragging?"grabbing":"grab"; return; }
    canvas.style.cursor="pointer";
    var lines=[];
    if(h.kind==="Constellation") lines=["tap for details"];
    else { if(h.mag!=null&&isFinite(h.mag))lines.push("magnitude "+h.mag.toFixed(1)); if(h.alt!=null)lines.push("alt "+h.alt.toFixed(0)+"° · az "+h.az.toFixed(0)+"° "+compass(h.az)); }
    tip.innerHTML='<div class="tt">'+h.title+'</div><div class="tk">'+h.kind+'</div>'+lines.map(function(l){return '<div class="tl">'+l+'</div>';}).join("");
    tip.classList.add("show");
    var tw=tip.offsetWidth, th=tip.offsetHeight, x=px+14, y=py+14;
    if(x+tw>innerWidth-8)x=px-tw-14; if(y+th>innerHeight-8)y=py-th-14;
    tip.style.left=x+"px"; tip.style.top=y+"px";
  }

  function draw(){
    if(reduce===false) t+=0.016;
    if(animating){ timeOffset+=1; if(timeOffset>720)timeOffset=-720; timeSlider.value=timeOffset; updateTimeLabel(); dirty=true; }
    if(dirty){ computePositions(); dirty=false; }
    ctx.clearRect(0,0,W,H);
    var g=ctx.createRadialGradient(cx,cy,0,cx,cy,RAD);
    g.addColorStop(0,sky.top); g.addColorStop(1,sky.hor);
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.fillStyle=col("--ink-faint"); ctx.font='600 12px '+col("--mono").replace(/"/g,"'"); ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("N",cx,16); ctx.fillText("S",cx,H-14); ctx.fillText("E",16,cy); ctx.fillText("W",W-16,cy);
    if(!dataReady){ ctx.fillStyle=col("--ink-faint"); ctx.font="14px "+col("--mono").replace(/"/g,"'"); ctx.fillText("loading star catalogue…",cx,cy); requestAnimationFrame(draw); return; }

    var dark=themeNow()==="dark";
    if(showLines){ ctx.strokeStyle="rgba("+(dark?"245,194,107":"90,70,20")+","+(0.26*Math.max(.35,sky.starK)).toFixed(2)+")"; ctx.lineWidth=0.8;
      ctx.beginPath(); for(var i=0;i<lineSegs.length;i++){ var s=lineSegs[i]; ctx.moveTo(s[0],s[1]); ctx.lineTo(s[2],s[3]); } ctx.stroke(); }
    var starCol=dark?"255,255,255":"18,32,63";
    for(i=0;i<starPts.length;i++){ var st=starPts[i]; var sz=Math.max(0.35,2.6-0.42*st.mag);
      var br=Math.max(0.14,Math.min(1,1.15-0.19*st.mag))*sky.starK; if(!reduce) br*=(0.82+0.18*Math.sin(t*1.3+st.x*0.05+st.y*0.05));
      ctx.beginPath(); ctx.arc(st.x,st.y,sz,0,6.2832); ctx.fillStyle="rgba("+starCol+","+br.toFixed(2)+")"; ctx.fill(); }
    if(mouse.on && !reduce && !dragging){ var R=140, near=[];
      for(i=0;i<starPts.length;i++){ var dx=starPts[i].x-mouse.x, dy=starPts[i].y-mouse.y, dd=dx*dx+dy*dy; if(dd<R*R) near.push({s:starPts[i],d:Math.sqrt(dd)}); }
      near.sort(function(a,b){return a.d-b.d;}); near=near.slice(0,8); var lc=dark?"245,194,107":"90,70,20";
      for(i=0;i<near.length;i++){ var al=(1-near[i].d/R)*0.8; ctx.beginPath(); ctx.moveTo(mouse.x,mouse.y); ctx.lineTo(near[i].s.x,near[i].s.y);
        ctx.strokeStyle="rgba("+lc+","+al.toFixed(2)+")"; ctx.lineWidth=0.8; ctx.stroke();
        if(near[i+1]){ ctx.beginPath(); ctx.moveTo(near[i].s.x,near[i].s.y); ctx.lineTo(near[i+1].s.x,near[i+1].s.y); ctx.strokeStyle="rgba("+lc+","+(al*0.5).toFixed(2)+")"; ctx.lineWidth=0.6; ctx.stroke(); } } }
    ctx.textAlign="left"; ctx.textBaseline="middle"; ctx.font="600 11px "+col("--mono").replace(/"/g,"'");
    for(i=0;i<bodyPts.length;i++){ var b=bodyPts[i];
      if(b.kind==="moon"){ ctx.beginPath(); ctx.arc(b.x,b.y,b.rad,0,6.2832); ctx.fillStyle="rgba(220,226,244,0.30)"; ctx.fill();
        ctx.beginPath(); ctx.arc(b.x,b.y,b.rad,0,6.2832); ctx.fillStyle="rgba(255,247,224,"+(0.35+0.6*b.illum).toFixed(2)+")"; ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(b.x,b.y,b.rad,0,6.2832); ctx.fillStyle=b.color; ctx.shadowColor=b.color; ctx.shadowBlur=10; ctx.fill(); ctx.shadowBlur=0;
        ctx.beginPath(); ctx.arc(b.x,b.y,b.rad+2.5,0,6.2832); ctx.strokeStyle=b.color; ctx.globalAlpha=.4; ctx.lineWidth=1; ctx.stroke(); ctx.globalAlpha=1; }
      ctx.fillStyle=dark?col("--ink"):"#1a2340"; ctx.fillText(b.label,b.x+b.rad+5,b.y); }
    if(issPt && issPt.alt>-2){ ctx.beginPath(); ctx.arc(issPt.x,issPt.y,3.4,0,6.2832); ctx.fillStyle="#8fe3ff"; ctx.shadowColor="#8fe3ff"; ctx.shadowBlur=8; ctx.fill(); ctx.shadowBlur=0;
      ctx.fillStyle=dark?col("--ink"):"#1a2340"; ctx.fillText("ISS",issPt.x+8,issPt.y); }
    if(highlight){ var hp=proj(highlight.ra,highlight.dec,lstf(julian(nowDate()),state.lon),state.lat);
      if(hp.alt>-2){ var pr=11+3*Math.sin(t*3); ctx.beginPath(); ctx.arc(hp.x,hp.y,pr,0,6.2832); ctx.strokeStyle=col("--accent"); ctx.lineWidth=1.6; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hp.x-pr-5,hp.y); ctx.lineTo(hp.x-pr+1,hp.y); ctx.moveTo(hp.x+pr-1,hp.y); ctx.lineTo(hp.x+pr+5,hp.y); ctx.stroke();
        ctx.fillStyle=col("--accent"); ctx.textAlign="center"; ctx.font="600 12px "+col("--mono").replace(/"/g,"'"); ctx.fillText(highlight.name,hp.x,hp.y-pr-8); ctx.textAlign="left"; } }
    requestAnimationFrame(draw);
  }

  // pointer: drag = rotate, hover = tooltip, tap = detail
  var dragging=false, dragMoved=0, lastX=0, downX=0, downY=0, isMouse=true;
  function relXY(e){ var r=canvas.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
  canvas.addEventListener("pointerdown",function(e){ dragging=true; dragMoved=0; var p=relXY(e); lastX=p.x; downX=e.clientX; downY=e.clientY;
    isMouse=(e.pointerType==="mouse"); canvas.classList.add("grabbing"); tip.classList.remove("show"); if(canvas.setPointerCapture)try{canvas.setPointerCapture(e.pointerId);}catch(_){} });
  canvas.addEventListener("pointermove",function(e){ var p=relXY(e); mouse.x=p.x; mouse.y=p.y; mouse.on=true;
    if(dragging){ var d=p.x-lastX; lastX=p.x; rotOffset=rev(rotOffset - d*0.3); dragMoved+=Math.abs(d); dirty=true; tip.classList.remove("show"); }
    else if(isMouse||e.pointerType==="mouse"){ showTip(p.x,p.y,e.clientX,e.clientY); } });
  function endDrag(e){ if(!dragging)return; dragging=false; canvas.classList.remove("grabbing");
    var moved=Math.hypot((e.clientX||downX)-downX,(e.clientY||downY)-downY);
    if(moved<6){ var p=relXY(e); var h=findHit(p.x,p.y); if(h){ openDetail(h); } } }
  canvas.addEventListener("pointerup",endDrag);
  canvas.addEventListener("pointerleave",function(){ mouse.on=false; mouse.x=-1e4; tip.classList.remove("show"); });

  var rt; addEventListener("resize",function(){ clearTimeout(rt); rt=setTimeout(resize,150); });
  var revs=[].slice.call(document.querySelectorAll(".reveal"));
  if(reduce||!("IntersectionObserver" in window)){ revs.forEach(function(el){el.classList.add("in");}); }
  else { var io=new IntersectionObserver(function(en){ en.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } }); },{threshold:.14}); revs.forEach(function(el){io.observe(el);}); }

  /* ===== search + fly-to ===== */
  var searchIn=document.getElementById("searchIn"), searchRes=document.getElementById("searchRes"), SIDX=null, selIx=-1, curMatches=[];
  function buildIndex(){
    var idx=[{label:"Sun",type:"sun"},{label:"Moon",type:"moon"}];
    PLANETS.forEach(function(p){ idx.push({label:p[0],type:"planet"}); });
    NAMED.forEach(function(n){ idx.push({label:n[0],type:"star",ra:n[1],dec:n[2],mag:n[3]}); });
    DSO.forEach(function(d){ idx.push({label:d[0],type:d[3],ra:d[1],dec:d[2],mag:d[4],note:d[5]}); });
    var seen={}; clines.forEach(function(c){ if(!seen[c.id]){ seen[c.id]=1; idx.push({label:CN[c.id]||c.id,type:"constellation",ra:c.pts[0][0],dec:c.pts[0][1]}); } });
    return idx;
  }
  function typeLabel(t){ return t==="constellation"?"Constellation":t.charAt(0).toUpperCase()+t.slice(1); }
  function computeRaDec(item){ var jd=julian(nowDate());
    if(item.type==="sun"){var s=sun(jd);return{ra:s.ra,dec:s.dec};}
    if(item.type==="moon"){var m=moon(jd);return{ra:m.ra,dec:m.dec};}
    if(item.type==="planet"){var p=planet(item.label,jd);return{ra:p.ra,dec:p.dec};}
    return {ra:item.ra,dec:item.dec};
  }
  function selectTarget(item){
    searchRes.classList.remove("show"); searchIn.value=item.label;
    var rd=computeRaDec(item), lst=lstf(julian(nowDate()),state.lon), pa=altaz(rd.ra,rd.dec,state.lat,lst);
    highlight={ra:rd.ra,dec:rd.dec,name:item.label};
    var kind=typeLabel(item.type);
    var v3 = item.type==="planet"?("planet:"+item.label):(["sun","moon","star","galaxy","nebula","cluster"].indexOf(item.type)>=0?item.type:null);
    var facts = item.type==="planet"?FACTS[item.label]:item.type==="sun"?FACTS.Sun:item.type==="moon"?FACTS.Moon:
      item.type==="star"?(STARDIST[item.label]?["Distance ~"+STARDIST[item.label]+" light-years"]:[]):(item.note?[item.note]:[]);
    openDetail({title:item.label,kind:kind,ra:rd.ra,dec:rd.dec,alt:pa.alt,az:pa.az,mag:item.mag,v3type:v3,facts:facts});
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function runSearch(){
    var q=searchIn.value.trim().toLowerCase();
    if(!q){ searchRes.classList.remove("show"); return; }
    if(!SIDX && dataReady) SIDX=buildIndex(); if(!SIDX) SIDX=buildIndex();
    curMatches=SIDX.filter(function(o){return o.label.toLowerCase().indexOf(q)>=0;}).slice(0,8); selIx=-1;
    if(!curMatches.length){ searchRes.innerHTML='<b><span class="sn">No match</span></b>'; searchRes.classList.add("show"); return; }
    searchRes.innerHTML=curMatches.map(function(o,i){return '<b data-i="'+i+'"><span class="sn">'+o.label+'</span><span class="stt">'+typeLabel(o.type)+'</span></b>';}).join("");
    searchRes.classList.add("show");
    [].forEach.call(searchRes.querySelectorAll("b[data-i]"),function(el){ el.addEventListener("click",function(){ selectTarget(curMatches[+el.getAttribute("data-i")]); }); });
  }
  searchIn.addEventListener("input",runSearch);
  searchIn.addEventListener("focus",runSearch);
  searchIn.addEventListener("keydown",function(e){
    if(!curMatches.length)return;
    if(e.key==="ArrowDown"){selIx=Math.min(selIx+1,curMatches.length-1);e.preventDefault();}
    else if(e.key==="ArrowUp"){selIx=Math.max(selIx-1,0);e.preventDefault();}
    else if(e.key==="Enter"){ selectTarget(curMatches[selIx<0?0:selIx]); return; }
    else return;
    [].forEach.call(searchRes.querySelectorAll("b"),function(el,i){el.classList.toggle("sel",i===selIx);});
  });
  document.addEventListener("click",function(e){ if(!e.target.closest(".searchwrap")) searchRes.classList.remove("show"); });

  /* ===== 3D fly-to (three.js — real textures + bloom + atmosphere) ===== */
  var TX={}, v3d=document.getElementById("view3d"), v3dCanvas=document.getElementById("v3dCanvas"),
      v3dTitle=document.getElementById("v3dTitle"), v3dInfo=document.getElementById("v3dInfo"), v3dLoad=document.getElementById("v3dLoad");
  var scene3=null, renderer3=null, composer3=null, raf3=0, cam=null, camState={th:0.7,ph:1.15,rad:5};
  var TEXURL={
    mercury:"https://upload.wikimedia.org/wikipedia/commons/9/92/Solarsystemscope_texture_2k_mercury.jpg",
    venus:"https://upload.wikimedia.org/wikipedia/commons/4/40/Solarsystemscope_texture_2k_venus_surface.jpg",
    mars:"https://upload.wikimedia.org/wikipedia/commons/4/46/Solarsystemscope_texture_2k_mars.jpg",
    jupiter:"https://upload.wikimedia.org/wikipedia/commons/b/be/Solarsystemscope_texture_2k_jupiter.jpg",
    saturn:"https://upload.wikimedia.org/wikipedia/commons/e/ea/Solarsystemscope_texture_2k_saturn.jpg",
    sun:"https://upload.wikimedia.org/wikipedia/commons/c/cb/Solarsystemscope_texture_2k_sun.jpg",
    moon:"https://upload.wikimedia.org/wikipedia/commons/2/26/Solarsystemscope_texture_2k_moon.jpg",
    ring:"https://upload.wikimedia.org/wikipedia/commons/7/7d/Solarsystemscope_texture_2k_saturn_ring_alpha.png"
  };
  var texCache={};
  function loadTex(key){ var T=TX.THREE; if(texCache[key])return texCache[key];
    var t=new T.TextureLoader().load(TEXURL[key]); t.colorSpace=T.SRGBColorSpace; t.anisotropy=4; texCache[key]=t; return t; }

  /* object images for info cards */
  var WM="https://commons.wikimedia.org/wiki/Special:FilePath/";
  var IMG={
    Sun:TEXURL.sun, Moon:TEXURL.moon, Mercury:TEXURL.mercury, Venus:TEXURL.venus, Mars:TEXURL.mars, Jupiter:TEXURL.jupiter, Saturn:TEXURL.saturn,
    ISS:WM+"International_Space_Station_after_undocking_of_STS-132.jpg?width=480",
    Sirius:WM+"Sirius_A_and_B_Hubble_photo.jpg?width=480",
    Betelgeuse:WM+"Betelgeuse.jpg?width=480",
    "M31 Andromeda Galaxy":WM+"Andromeda_Galaxy_(with_h-alpha).jpg?width=480",
    "M42 Orion Nebula":WM+"Orion_Nebula_-_Hubble_2006_mosaic_18000.jpg?width=480",
    "M45 Pleiades":WM+"Pleiades_large.jpg?width=480",
    "M13 Hercules Cluster":WM+"Messier_13.jpg?width=480",
    "M57 Ring Nebula":WM+"M57_The_Ring_Nebula.JPG?width=480",
    "M27 Dumbbell Nebula":WM+"M27_-_Dumbbell_Nebula.jpg?width=480",
    "M8 Lagoon Nebula":WM+"Lagoon_Nebula.jpg?width=480",
    "M51 Whirlpool Galaxy":WM+"Whirlpool_Galaxy.jpg?width=480",
    "M81 Bode's Galaxy":WM+"Messier_81.jpg?width=480",
    "M104 Sombrero Galaxy":WM+"M104_ngc4594_sombrero_galaxy_hi-res.jpg?width=480",
    "M1 Crab Nebula":WM+"Crab_Nebula.jpg?width=480",
    "M44 Beehive Cluster":WM+"Beehive_cluster.jpg?width=480",
    "M16 Eagle Nebula":WM+"Eagle_Nebula.jpg?width=480",
    "M22 Sagittarius Cluster":WM+"Messier22.jpg?width=480",
    "M7 Ptolemy Cluster":WM+"Messier_7.jpg?width=480"
  };
  function objImage(o){
    if(IMG[o.title]) return IMG[o.title];
    if(o.v3type && o.v3type.indexOf("planet:")===0){ var pn=o.v3type.split(":")[1]; return TEXURL[pn]||null; }
    return null;
  }
  function ensureThree(){ if(TX.THREE) return Promise.resolve(TX);
    return Promise.all([ import("three"),
      import("three/addons/postprocessing/EffectComposer.js"), import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/UnrealBloomPass.js"), import("three/addons/postprocessing/OutputPass.js") ])
    .then(function(m){ TX.THREE=m[0]; TX.EffectComposer=m[1].EffectComposer; TX.RenderPass=m[2].RenderPass; TX.UnrealBloomPass=m[3].UnrealBloomPass; TX.OutputPass=m[4].OutputPass; return TX; });
  }
  function positionCam(){ if(!cam)return; var r=camState.rad,ph=camState.ph,th=camState.th;
    cam.position.set(r*Math.sin(ph)*Math.cos(th), r*Math.cos(ph), r*Math.sin(ph)*Math.sin(th)); cam.lookAt(0,0,0); }
  function open3D(o){
    v3d.classList.add("show"); v3dTitle.textContent=o.title; v3dLoad.textContent="loading 3D engine…"; v3dLoad.classList.add("show");
    var rows=[]; if(o.ra!=null)rows.push("RA "+raHMS(o.ra)); if(o.dec!=null)rows.push("Dec "+decDMS(o.dec));
    if(o.alt!=null)rows.push("Alt "+o.alt.toFixed(0)+"° · Az "+o.az.toFixed(0)+"° "+compass(o.az));
    (o.facts||[]).forEach(function(f){rows.push(f);});
    v3dInfo.innerHTML="<h4>"+o.title+"</h4>"+rows.map(function(r){return '<div class="r">'+r+'</div>';}).join("");
    ensureThree().then(function(X){ v3dLoad.classList.remove("show"); buildScene(X,o); }).catch(function(){ v3dLoad.textContent="Could not load 3D engine (offline?)"; });
  }
  function closeV3(){ v3d.classList.remove("show"); if(raf3)cancelAnimationFrame(raf3); raf3=0;
    if(renderer3){ try{renderer3.dispose();}catch(_){} if(renderer3.domElement&&renderer3.domElement.parentNode)renderer3.domElement.parentNode.removeChild(renderer3.domElement); renderer3=null; } scene3=null; composer3=null; }
  document.getElementById("v3dClose").addEventListener("click",closeV3);
  document.addEventListener("keydown",function(e){ if(e.key==="Escape"&&v3d.classList.contains("show"))closeV3(); });
  function glowTex(T){ var c=document.createElement("canvas"); c.width=c.height=64; var x=c.getContext("2d");
    var g=x.createRadialGradient(32,32,0,32,32,32); g.addColorStop(0,"rgba(255,255,255,1)"); g.addColorStop(.25,"rgba(255,255,255,.7)"); g.addColorStop(1,"rgba(255,255,255,0)");
    x.fillStyle=g; x.fillRect(0,0,64,64); return new T.CanvasTexture(c); }
  function bgStars(T,scene){ var g=new T.BufferGeometry(), n=1600, pos=new Float32Array(n*3);
    for(var i=0;i<n;i++){ var r=90,u=Math.random()*2-1,th=Math.random()*6.283,s=Math.sqrt(1-u*u); pos[i*3]=r*s*Math.cos(th);pos[i*3+1]=r*u;pos[i*3+2]=r*s*Math.sin(th); }
    g.setAttribute("position",new T.BufferAttribute(pos,3)); scene.add(new T.Points(g,new T.PointsMaterial({color:0xffffff,size:0.32,sizeAttenuation:true,transparent:true,opacity:.9}))); }
  function atmosphere(T,radius,color,power,intensity){
    var mat=new T.ShaderMaterial({ transparent:true, blending:T.AdditiveBlending, side:T.BackSide, depthWrite:false,
      uniforms:{ uColor:{value:new T.Color(color)}, uPow:{value:power}, uInt:{value:intensity} },
      vertexShader:"varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz; gl_Position=projectionMatrix*mv; }",
      fragmentShader:"uniform vec3 uColor; uniform float uPow; uniform float uInt; varying vec3 vN; varying vec3 vP; void main(){ float f=pow(1.0-max(dot(vN,normalize(-vP)),0.0),uPow); gl_FragColor=vec4(uColor,f*uInt); }" });
    return new T.Mesh(new T.SphereGeometry(radius,64,64),mat);
  }
  function ringMesh(T){ var inner=1.35, outer=2.35, geo=new T.RingGeometry(inner,outer,120), pos=geo.attributes.position, uv=geo.attributes.uv, v=new T.Vector3();
    for(var i=0;i<pos.count;i++){ v.fromBufferAttribute(pos,i); var rr=(v.length()-inner)/(outer-inner); uv.setXY(i,rr,0.5); }
    var tex=loadTex("ring"); var m=new T.Mesh(geo,new T.MeshBasicMaterial({map:tex,alphaMap:tex,transparent:true,side:T.DoubleSide,depthWrite:false}));
    m.rotation.x=Math.PI*0.46; return m; }
  function buildScene(X,o){
    var T=X.THREE;
    while(v3dCanvas.firstChild)v3dCanvas.removeChild(v3dCanvas.firstChild);
    var w=v3dCanvas.clientWidth||innerWidth, h=v3dCanvas.clientHeight||innerHeight;
    renderer3=new T.WebGLRenderer({antialias:true,alpha:true}); renderer3.setPixelRatio(Math.min(devicePixelRatio,2)); renderer3.setSize(w,h);
    renderer3.outputColorSpace=T.SRGBColorSpace; renderer3.toneMapping=T.ACESFilmicToneMapping; renderer3.toneMappingExposure=1.1; v3dCanvas.appendChild(renderer3.domElement);
    scene3=new T.Scene(); cam=new T.PerspectiveCamera(50,w/h,0.01,3000); bgStars(T,scene3);
    composer3=new X.EffectComposer(renderer3); composer3.addPass(new X.RenderPass(scene3,cam));
    var bloom=new X.UnrealBloomPass(new T.Vector2(w,h),0.7,0.55,0.82); composer3.addPass(bloom); composer3.addPass(new X.OutputPass());
    var kind=o.v3type||"", spin=0.003, camRad=3.0, spinObj=null;
    function sunlight(intn){ var d=new T.DirectionalLight(0xfff4e6,intn||2.4); d.position.set(5,2,4); scene3.add(d); scene3.add(new T.AmbientLight(0x223044,0.22)); }
    if(kind.indexOf("planet:")===0){ var pn=kind.split(":")[1].toLowerCase();
      var mat=new T.MeshStandardMaterial({ map:loadTex(pn), roughness:1, metalness:0 });
      if(pn==="mercury"||pn==="mars"){ mat.bumpMap=loadTex(pn); mat.bumpScale=0.025; }
      spinObj=new T.Mesh(new T.SphereGeometry(1,96,96),mat); scene3.add(spinObj);
      if(pn==="saturn") scene3.add(ringMesh(T));
      if(pn==="venus") scene3.add(atmosphere(T,1.035,0xffe2a0,3.0,0.95));
      else if(pn==="mars") scene3.add(atmosphere(T,1.02,0xdd8f6e,4.0,0.4));
      else if(pn==="jupiter"||pn==="saturn") scene3.add(atmosphere(T,1.02,0xf1ddb2,4.5,0.35));
      sunlight(2.6);
    } else if(kind==="sun"){
      spinObj=new T.Mesh(new T.SphereGeometry(1,96,96),new T.MeshBasicMaterial({map:loadTex("sun")})); scene3.add(spinObj);
      var sp=new T.Sprite(new T.SpriteMaterial({map:glowTex(T),color:0xffb845,transparent:true,blending:T.AdditiveBlending})); sp.scale.set(6.5,6.5,1); scene3.add(sp);
      spin=0.0016; camRad=3.2;
    } else if(kind==="moon"){
      spinObj=new T.Mesh(new T.SphereGeometry(1,96,96),new T.MeshStandardMaterial({map:loadTex("moon"),bumpMap:loadTex("moon"),bumpScale:0.02,roughness:1})); scene3.add(spinObj); sunlight(2.4);
    } else if(kind==="star"){
      spinObj=new T.Mesh(new T.SphereGeometry(0.6,48,48),new T.MeshBasicMaterial({color:0xfff2cc})); scene3.add(spinObj);
      var sg=new T.Sprite(new T.SpriteMaterial({map:glowTex(T),color:0xfff2cc,transparent:true,blending:T.AdditiveBlending})); sg.scale.set(5,5,1); scene3.add(sg); camRad=4; spin=0.01;
    } else if(kind==="galaxy"){
      var gg=new T.BufferGeometry(), n=7000, gp=new Float32Array(n*3), gc=new Float32Array(n*3);
      for(var i=0;i<n;i++){ var arm=i%3, r=Math.pow(Math.random(),0.6)*2.2, ang=r*2.6+arm*2.094+(Math.random()-0.5)*0.5, yz=(Math.random()-0.5)*0.14/(0.25+r);
        gp[i*3]=Math.cos(ang)*r; gp[i*3+1]=yz; gp[i*3+2]=Math.sin(ang)*r; var cc=r<0.35?1:0.6+0.4*Math.random(); gc[i*3]=1;gc[i*3+1]=0.82*cc;gc[i*3+2]=0.6*cc; }
      gg.setAttribute("position",new T.BufferAttribute(gp,3)); gg.setAttribute("color",new T.BufferAttribute(gc,3));
      spinObj=new T.Points(gg,new T.PointsMaterial({size:0.04,vertexColors:true,transparent:true,opacity:.95,blending:T.AdditiveBlending})); spinObj.rotation.x=0.5; scene3.add(spinObj); camRad=5; spin=0.0016;
    } else if(kind==="nebula"){
      for(var k=0;k<52;k++){ var s2=new T.Sprite(new T.SpriteMaterial({map:glowTex(T),color:(k%2?0xff5588:0x5f8bff),transparent:true,opacity:.16,blending:T.AdditiveBlending}));
        s2.position.set((Math.random()-0.5)*3,(Math.random()-0.5)*2,(Math.random()-0.5)*3); var ss=1+Math.random()*2; s2.scale.set(ss,ss,1); scene3.add(s2); }
      var ng=new T.BufferGeometry(),nn=350,np=new Float32Array(nn*3); for(var m2=0;m2<nn;m2++){np[m2*3]=(Math.random()-0.5)*3.2;np[m2*3+1]=(Math.random()-0.5)*2.2;np[m2*3+2]=(Math.random()-0.5)*3.2;}
      ng.setAttribute("position",new T.BufferAttribute(np,3)); scene3.add(new T.Points(ng,new T.PointsMaterial({color:0xffffff,size:0.03}))); camRad=5;
    } else if(kind==="cluster"){
      var cg=new T.BufferGeometry(),cn=600,cp=new Float32Array(cn*3); for(var q=0;q<cn;q++){ var rr=Math.pow(Math.random(),0.5)*1.6,uu=Math.random()*2-1,tt=Math.random()*6.283,sss=Math.sqrt(1-uu*uu); cp[q*3]=rr*sss*Math.cos(tt);cp[q*3+1]=rr*uu;cp[q*3+2]=rr*sss*Math.sin(tt); }
      cg.setAttribute("position",new T.BufferAttribute(cp,3)); spinObj=new T.Points(cg,new T.PointsMaterial({color:0xfff0d0,size:0.055,blending:T.AdditiveBlending,transparent:true})); scene3.add(spinObj); camRad=4.5; spin=0.0016;
    } else { spinObj=new T.Mesh(new T.SphereGeometry(1,48,48),new T.MeshStandardMaterial({color:0x8899bb,roughness:1})); scene3.add(spinObj); sunlight(2.2); }
    camState={th:0.7,ph:1.15,rad:camRad*2.4}; var camTarget=camRad, flew=false;
    var down=false,lx=0,ly=0, el=renderer3.domElement; el.style.touchAction="none";
    el.addEventListener("pointerdown",function(e){down=true;lx=e.clientX;ly=e.clientY;});
    window.addEventListener("pointerup",function(){down=false;});
    el.addEventListener("pointermove",function(e){ if(!down)return; camState.th-=(e.clientX-lx)*0.006; camState.ph-=(e.clientY-ly)*0.006; camState.ph=Math.max(0.16,Math.min(3.0,camState.ph)); lx=e.clientX;ly=e.clientY; });
    el.addEventListener("wheel",function(e){ e.preventDefault(); camState.rad*=(e.deltaY>0?1.1:0.9); camState.rad=Math.max(1.5,Math.min(40,camState.rad)); flew=true; },{passive:false});
    function v3resize(){ if(!renderer3)return; var ww=v3dCanvas.clientWidth,hh=v3dCanvas.clientHeight; renderer3.setSize(ww,hh); if(composer3)composer3.setSize(ww,hh); cam.aspect=ww/hh; cam.updateProjectionMatrix(); }
    window.addEventListener("resize",v3resize);
    function loop(){ raf3=requestAnimationFrame(loop);
      if(!flew){ camState.rad+=(camTarget-camState.rad)*0.06; if(Math.abs(camState.rad-camTarget)<0.05){camState.rad=camTarget;flew=true;} }
      if(spinObj&&spinObj.rotation) spinObj.rotation.y+=spin;
      positionCam(); if(composer3)composer3.render(); else renderer3.render(scene3,cam);
    }
    loop();
  }

  /* ===== Explain-this tutor + star-map poster + gear (monetization) ===== */
  var AFF_TAG=(window.MERIDIAN_AFF_TAG||"meridian-20");   // Amazon Associates tag (owner-configurable)
  var POD_URL=(window.MERIDIAN_POD_URL||"");              // print-on-demand upload URL (optional)
  var AI_ENDPOINT=(window.MERIDIAN_AI_ENDPOINT||"");      // optional explainer API: POST {object,kind,type} -> {text}

  var EXPLAIN={
    Sun:"The Sun is our home star — a 4.6-billion-year-old ball of hydrogen and helium so large that a million Earths would fit inside. Its light takes about 8 minutes to reach you, and every photon began as nuclear fusion in a core hotter than 15 million degrees. Never look at it directly without a certified solar filter.",
    Moon:"The Moon is Earth's only natural satellite, about a quarter of Earth's width and just over a light-second away. The phase you see is simply sunlight striking it from a changing angle — it isn't growing or shrinking. The same face always points at us because its spin and orbit are locked together.",
    Mercury:"Mercury is the smallest planet and the closest to the Sun, so it never strays far from it in our sky — catch it low near sunrise or sunset. With almost no atmosphere it bakes above 400°C by day and freezes below −170°C at night.",
    Venus:"Venus is the brightest planet, often the brightest thing in the sky after the Moon. A runaway greenhouse effect traps heat under thick sulphuric-acid clouds, making its surface hotter than Mercury's — about 465°C. A telescope shows it going through phases, just like the Moon.",
    Mars:"Mars, the Red Planet, owes its colour to iron oxide — literally rust — in its soil. About half Earth's size, it hosts Olympus Mons, the tallest volcano in the solar system, and its brightness swings a lot depending on how close its orbit brings it to us.",
    Jupiter:"Jupiter is the giant of the solar system — so massive you could pour 1,300 Earths into it. Even small binoculars reveal its four largest moons as pinpricks; a telescope shows cloud bands and the Great Red Spot, a storm wider than Earth that has raged for centuries.",
    Saturn:"Saturn is the jewel of any telescope — its rings are countless chunks of ice and rock spanning some 280,000 km yet only tens of metres thick. It's a gas giant so light it would float in water, with more than 140 known moons.",
    Sirius:"Sirius is the brightest star in the night sky, in Canis Major — the 'Dog Star.' It looks brilliant both because it's genuinely luminous and because, at 8.6 light-years, it's one of our nearest stellar neighbours. It hides a tiny white-dwarf companion.",
    Betelgeuse:"Betelgeuse is a red supergiant marking Orion's shoulder — so vast that, placed where the Sun is, it would swallow Mars. It's nearing the end of its life and will one day explode as a supernova, briefly bright enough to see in daylight.",
    Polaris:"Polaris, the North Star, sits almost exactly above Earth's north pole, so it barely moves while every other star wheels around it. Its height above your horizon equals your latitude — a trick sailors used for centuries to navigate.",
    Vega:"Vega is one of the brightest summer stars and a corner of the Summer Triangle. Just 25 light-years away, it was the pole star 12,000 years ago and will be again — Earth's axis slowly wobbles like a spinning top.",
    Rigel:"Rigel is a blue supergiant at Orion's foot, thousands of times more luminous than the Sun. Its blue-white glow tells you its surface is far hotter than our yellow star.",
    Antares:"Antares is the red heart of Scorpius — its name means 'rival of Mars' for its similar ruddy colour. It's a red supergiant hundreds of times the Sun's diameter.",
    Aldebaran:"Aldebaran is the orange eye of Taurus the bull, an ageing giant about 65 light-years away. It appears to sit among the Hyades cluster but is really much closer, in the foreground.",
    Arcturus:"Arcturus is the brightest star in the northern sky, an orange giant racing through the galaxy at a steep angle to the Milky Way's disk. Follow the curve of the Big Dipper's handle to find it.",
    Canopus:"Canopus is the second-brightest star in the night sky, a white supergiant far to the south. Spacecraft use it as a navigation reference precisely because it's so bright and isolated."
  };
  function explainLocal(o){
    if(EXPLAIN[o.title]) return EXPLAIN[o.title];
    var k=(o.kind||"").toLowerCase(), v=o.v3type||"";
    if(v==="galaxy") return o.title+" is a galaxy — an island of hundreds of billions of stars bound by gravity, so distant its light left before humans existed. What looks like a faint smudge to the eye is a whole other Milky Way.";
    if(v==="nebula") return o.title+" is a nebula — a cloud of gas and dust in space. Some are stellar nurseries where new stars ignite; others are the glowing wreckage of stars that have died. They're where the atoms in your body were forged.";
    if(v==="cluster") return o.title+" is a star cluster — a family of stars born together from one cloud and still travelling together. Open clusters are young and loose; globular clusters are ancient, dense balls of hundreds of thousands of stars.";
    if(k==="constellation") return o.title+" is a constellation — a pattern our ancestors traced among the stars. The stars usually aren't neighbours in space at all; they just line up by chance from our viewpoint. Astronomers use 88 official constellations to map the sky.";
    if(k==="star"){ var d=""; if(o.facts&&o.facts[0])d=" "+o.facts[0]+"."; return o.title+" is a star — a distant sun whose light has travelled years or centuries to reach your eye tonight."+d+(o.mag!=null&&isFinite(o.mag)?" At magnitude "+o.mag.toFixed(1)+", "+(o.mag<2?"it's one of the brighter stars you can name.":"it's easily visible to the unaided eye under a dark sky."):""); }
    return o.title+" is one of the objects Meridian can point you to tonight. Tap ‘Fly to in 3D’ to see it up close.";
  }
  function explain(o){
    var out=document.getElementById("explainOut"); if(!out) return;
    out.classList.add("show"); out.textContent="…";
    if(AI_ENDPOINT){
      fetch(AI_ENDPOINT,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({object:o.title,kind:o.kind,type:o.v3type})})
        .then(function(r){return r.json();}).then(function(d){ out.textContent=(d&&d.text)?d.text:explainLocal(o); })
        .catch(function(){ out.textContent=explainLocal(o); });
    } else out.textContent=explainLocal(o);
  }

  var GEAR=[
    {t:"Beginner telescope",q:"celestron starsense explorer telescope",d:"App-guided — point your phone and it shows you what you're seeing.",tags:["planet","moon","star","galaxy","nebula","cluster","sun"]},
    {t:"Go-to telescope",q:"celestron nexstar computerized telescope",d:"Motorised tracking — the best views of the planets and the Moon.",tags:["planet","moon"]},
    {t:"Astronomy binoculars",q:"skymaster 25x70 astronomy binoculars",d:"The cheapest way in — the Moon, clusters and the Milky Way.",tags:["moon","cluster","galaxy","star"]},
    {t:"Planisphere star wheel",q:"planisphere star wheel",d:"Dial in your date and find every constellation. No battery needed.",tags:["constellation","star"]},
    {t:"Red night-vision torch",q:"red led astronomy flashlight",d:"Keeps your eyes dark-adapted while you read charts at the scope.",tags:["constellation","nebula","cluster","galaxy"]}
  ];
  function gearHref(g){ return "https://www.amazon.com/s?k="+encodeURIComponent(g.q)+"&tag="+encodeURIComponent(AFF_TAG); }
  function gearCard(g){ return '<a class="gear-card" href="'+gearHref(g)+'" target="_blank" rel="sponsored noopener"><span class="gt">'+g.t+'</span><span class="gd">'+g.d+'</span><span class="gl">View on Amazon ↗</span></a>'; }
  function renderGear(){ var el=document.getElementById("gearGrid"); if(el) el.innerHTML=GEAR.map(gearCard).join(""); }
  function contextGear(o){
    var key=(o.v3type&&o.v3type.indexOf("planet:")===0)?"planet":(o.v3type||(o.kind||"").toLowerCase());
    var pick=GEAR.filter(function(g){return g.tags.indexOf(key)>=0;}).slice(0,2); if(!pick.length)pick=GEAR.slice(0,1);
    return '<div class="cgear">'+pick.map(function(g){return '<a href="'+gearHref(g)+'" target="_blank" rel="sponsored noopener" class="cgear-l">🔭 '+g.t+' ↗</a>';}).join("")+'</div>';
  }

  /* ---- star-map poster ---- */
  var posterEl=document.getElementById("poster"), posterCanvas=document.getElementById("posterCanvas");
  function posterDate(){ return nowDate().toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"}); }
  function drawPoster(cv){
    var w=cv.width, h=cv.height, x=cv.getContext("2d");
    x.fillStyle="#080c1e"; x.fillRect(0,0,w,h);
    x.strokeStyle="rgba(245,194,107,.5)"; x.lineWidth=Math.max(2,w*0.004); x.strokeRect(w*0.05,w*0.05,w*0.9,h-w*0.1);
    var pcx=w/2, pcy=w*0.52, prad=w*0.40;
    var now=nowDate(), jd=julian(now), lst=lstf(jd,state.lon), lat=state.lat;
    function pp(ra,dec){ var p=altaz(ra,dec,lat,lst), rr=(1-p.alt/90)*prad, ang=(p.az+rotOffset)*D2R; return {x:pcx-rr*Math.sin(ang), y:pcy-rr*Math.cos(ang), alt:p.alt}; }
    x.save(); x.beginPath(); x.arc(pcx,pcy,prad,0,6.2832); x.clip();
    var gg=x.createRadialGradient(pcx,pcy,0,pcx,pcy,prad); gg.addColorStop(0,"#0c1533"); gg.addColorStop(1,"#05070f"); x.fillStyle=gg; x.fillRect(0,0,w,h);
    var i,j;
    if(showLines){ x.strokeStyle="rgba(245,194,107,.45)"; x.lineWidth=Math.max(1,w*0.0016);
      for(i=0;i<clines.length;i++){ var pl=clines[i].pts; for(j=0;j<pl.length-1;j++){ var a=pp(pl[j][0],pl[j][1]), b=pp(pl[j+1][0],pl[j+1][1]); if(a.alt>0&&b.alt>0){ x.beginPath(); x.moveTo(a.x,a.y); x.lineTo(b.x,b.y); x.stroke(); } } } }
    for(i=0;i<stars.length;i++){ var s=pp(stars[i][0],stars[i][1]); if(s.alt>0){ var sz=Math.max(w*0.0009,(2.6-0.42*stars[i][2])*w*0.0012); x.beginPath(); x.arc(s.x,s.y,sz,0,6.2832); x.fillStyle="rgba(255,255,255,"+Math.max(0.25,Math.min(1,1.15-0.19*stars[i][2])).toFixed(2)+")"; x.fill(); } }
    var jd2=jd, lst2=lst;
    var so=sun(jd2), sa=altaz(so.ra,so.dec,lat,lst2); if(sa.alt>0){ var sq=pp(so.ra,so.dec); x.fillStyle="#f5c26b"; x.beginPath(); x.arc(sq.x,sq.y,w*0.01,0,6.2832); x.fill(); }
    var mo=moon(jd2), ma=altaz(mo.ra,mo.dec,lat,lst2); if(ma.alt>0){ var mq=pp(mo.ra,mo.dec); x.fillStyle="#fff7e0"; x.beginPath(); x.arc(mq.x,mq.y,w*0.009,0,6.2832); x.fill(); }
    PLANETS.forEach(function(p){ var po=planet(p[0],jd2), pa=altaz(po.ra,po.dec,lat,lst2); if(pa.alt>0){ var pq=pp(po.ra,po.dec); x.fillStyle=p[1]; x.beginPath(); x.arc(pq.x,pq.y,w*0.006,0,6.2832); x.fill(); } });
    x.restore();
    x.strokeStyle="rgba(245,194,107,.7)"; x.lineWidth=Math.max(2,w*0.003); x.beginPath(); x.arc(pcx,pcy,prad,0,6.2832); x.stroke();
    x.textAlign="center";
    x.fillStyle="#f5c26b"; x.font="600 "+(w*0.075)+"px Georgia,serif"; x.fillText("YOUR SKY", pcx, h-w*0.30);
    x.fillStyle="#d9e0f4"; x.font=(w*0.035)+"px Georgia,serif"; x.fillText(state.label.replace(/\s*\(default\)/,""), pcx, h-w*0.235);
    x.fillStyle="#9aa5c7"; x.font=(w*0.025)+"px monospace"; x.fillText(posterDate()+"   ·   "+fmtLat(state.lat)+"  "+fmtLon(state.lon), pcx, h-w*0.185);
    x.fillStyle="#616c92"; x.font=(w*0.020)+"px monospace"; x.fillText("MERIDIAN · meridian-nightsky.vercel.app", pcx, h-w*0.10);
  }
  function openPoster(){
    if(!dataReady){ alert("The sky is still loading — try again in a moment."); return; }
    posterEl.classList.add("show");
    posterCanvas.width=1000; posterCanvas.height=1300; drawPoster(posterCanvas);
  }
  function closePoster(){ posterEl.classList.remove("show"); }
  function downloadPoster(){
    var big=document.createElement("canvas"); big.width=1600; big.height=2080; drawPoster(big);
    big.toBlob(function(blob){ if(!blob){ alert("Could not render the poster."); return; } var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
      a.download="meridian-sky-"+nowDate().toISOString().slice(0,10)+".png"; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },2000); },"image/png");
  }
  function orderPrint(){
    if(POD_URL){ window.open(POD_URL,"_blank","noopener"); return; }
    alert("Tap ‘Download PNG’ to save your poster, then upload it to any print-on-demand service (Printful, Gelato, or a local print shop) for a framed print.\n\nOwners: set window.MERIDIAN_POD_URL to wire one-click ordering.");
  }
  var _pb=document.getElementById("posterBtn"); if(_pb) _pb.addEventListener("click",openPoster);
  var _pc=document.getElementById("posterClose"); if(_pc) _pc.addEventListener("click",closePoster);
  var _pd=document.getElementById("posterDl"); if(_pd) _pd.addEventListener("click",downloadPoster);
  var _po=document.getElementById("posterOrder"); if(_po) _po.addEventListener("click",orderPrint);
  document.addEventListener("keydown",function(e){ if(e.key==="Escape"&&posterEl&&posterEl.classList.contains("show"))closePoster(); });
  renderGear();

  /* ===== live hub: news, watch, tracking, observing, events ===== */
  [].forEach.call(document.querySelectorAll(".tab"),function(btn){
    btn.addEventListener("click",function(){
      [].forEach.call(document.querySelectorAll(".tab"),function(b){b.setAttribute("aria-selected",b===btn?"true":"false");});
      [].forEach.call(document.querySelectorAll(".tabpanel"),function(p){p.classList.remove("show");});
      var id="tab-"+btn.getAttribute("data-tab"), panel=document.getElementById(id); if(panel)panel.classList.add("show");
      if(id==="tab-obs") renderObs(); if(id==="tab-events") renderEvents();
    });
  });

  function renderNews(list){
    var el=document.getElementById("newsGrid"); if(!el) return;
    if(!list||!list.length){ el.innerHTML='<div class="hub-empty">Couldn\'t load news right now.</div>'; return; }
    el.innerHTML=list.slice(0,6).map(function(a){
      var img=a.image_url?('<img src="'+a.image_url+'" alt="" loading="lazy" onerror="this.remove()">'):'';
      var title=document.createElement("div"); title.textContent=a.title||""; // escape via textContent, read back safely
      return '<a class="news-card" href="'+a.url+'" target="_blank" rel="noopener">'+img+'<div class="nb"><div class="nt">'+title.innerHTML+'</div><div class="ns">'+(a.news_site||"")+'</div></div></a>';
    }).join("");
  }
  function fetchNews(){
    fetch("https://api.spaceflightnewsapi.net/v4/articles/?limit=6").then(function(r){return r.json();}).then(function(d){ renderNews(d.results); }).catch(function(){ renderNews([]); });
  }
  fetchNews(); setInterval(fetchNews,60000);

  var LAUNCHES=[];
  function fetchLaunches(){
    fetch("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=5&format=json").then(function(r){return r.json();}).then(function(d){ LAUNCHES=d.results||[]; renderTrack(); }).catch(function(){ renderTrack(); });
  }
  fetchLaunches(); setInterval(fetchLaunches,300000);

  function renderTrack(){
    var el=document.getElementById("trackGrid"); if(!el) return;
    var issCard='<div class="track-card"><h4>🛰️ ISS · live position</h4>'
      +(ISS.ok ? ('<div class="tr"><span>Latitude</span><span>'+ISS.lat.toFixed(2)+'°</span></div>'
        +'<div class="tr"><span>Longitude</span><span>'+ISS.lon.toFixed(2)+'°</span></div>'
        +'<div class="tr"><span>Altitude</span><span>'+Math.round(ISS.altkm)+' km</span></div>'
        +'<div class="tr"><span>Speed</span><span>'+Math.round(ISS.vel)+' km/h</span></div>'
        +'<div class="tr"><span>From your spot</span><span>'+(issPt&&issPt.alt>0?('visible · alt '+issPt.alt.toFixed(0)+'°'):'below horizon')+'</span></div>')
        : '<div class="hub-empty">Loading…</div>')
      +'</div>';
    var launchCards = LAUNCHES.length ? LAUNCHES.map(function(l){
        var d=new Date(l.net), when=isNaN(d)?"TBD":d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
        var abbrev=(l.status&&l.status.abbrev)||"—", go=(abbrev==="Go"||abbrev==="TBC");
        var vid=(l.vidURLs&&l.vidURLs[0]&&l.vidURLs[0].url)||null;
        var nm=document.createElement("div"); nm.textContent=l.name||"Launch";
        var prov=document.createElement("div"); prov.textContent=(l.launch_service_provider&&l.launch_service_provider.name)||"—";
        return '<div class="track-card"><h4>🚀 '+nm.innerHTML+'</h4>'
          +'<div class="tr"><span>Provider</span><span>'+prov.innerHTML+'</span></div>'
          +'<div class="tr"><span>When</span><span>'+when+'</span></div>'
          +'<div class="tr"><span>Status</span><span class="badge2'+(go?' go':'')+'">'+abbrev+'</span></div>'
          +(vid?('<div class="tr"><span>Stream</span><span><a href="'+vid+'" target="_blank" rel="noopener" style="color:var(--cool)">Watch ↗</a></span></div>'):'')
          +'</div>';
      }).join("") : '<div class="hub-empty">Loading launches…</div>';
    el.innerHTML=issCard+launchCards;
  }

  var OBS=[
    {n:"Hubble Space Telescope", d:"In continuous operation since 1990, cycling through deep-field imaging, exoplanet atmospheres and stellar evolution targets on a rolling schedule set months in advance.", l:"https://www.stsci.edu/instruments/current-observing"},
    {n:"James Webb Space Telescope", d:"Observing in infrared from 1.5M km away (L2), split between guaranteed-time, general-observer and director's-discretionary programs. See the official live pointing tracker.", l:"https://www.jwst.nasa.gov/content/webbLaunch/whereIsWebb.html"},
    {n:"Very Large Telescope (ESO)", d:"Four 8.2m units in Chile's Atacama Desert running a nightly queue of spectroscopy and imaging across the southern sky.", l:"https://www.eso.org/public/teles-instr/paranal-observatory/vlt/"},
    {n:"Keck Observatory", d:"Twin 10m telescopes atop Mauna Kea, Hawaii — among the largest optical/infrared telescopes on Earth.", l:"https://keckobservatory.org/"}
  ];
  function renderObs(){
    var el=document.getElementById("obsGrid"); if(!el||el.dataset.done) return; el.dataset.done="1";
    el.innerHTML=OBS.map(function(o){return '<div class="obs-card"><h4>'+o.n+'</h4><p>'+o.d+'</p><a href="'+o.l+'" target="_blank" rel="noopener">Official tracker ↗</a></div>';}).join("");
  }

  var SHOWERS=[["Quadrantids",0,4],["Lyrids",3,22],["Eta Aquariids",4,5],["Perseids",7,12],["Orionids",9,21],["Leonids",10,17],["Geminids",11,14],["Ursids",11,22]];
  function nextOccurrence(m,d){ var now=new Date(), y=now.getFullYear(), dt=new Date(y,m,d,12); if(dt<now) dt=new Date(y+1,m,d,12); return dt; }
  function renderEvents(){
    var el=document.getElementById("evList"); if(!el||el.dataset.done) return; el.dataset.done="1";
    var items=SHOWERS.map(function(s){ return {name:s[0]+" meteor shower", date:nextOccurrence(s[1],s[2])}; });
    items.sort(function(a,b){return a.date-b.date;}); items=items.slice(0,6);
    el.innerHTML=items.map(function(it){ return '<div class="ev-row"><span class="ek">'+it.name+'</span><span class="ed">'+it.date.toLocaleDateString(undefined,{month:"long",day:"numeric"})+'</span></div>'; }).join("");
  }

  fetchISS(); setInterval(fetchISS,8000);

  /* ===== AI ask FAB (limited free questions, Pro gate) ===== */
  var askFab=document.getElementById("askFab"), askPanel=document.getElementById("askPanel"), askBody=document.getElementById("askBody"),
      askInput=document.getElementById("askInput"), askSend=document.getElementById("askSend"), askLimit=document.getElementById("askLimit");
  var ASK_FREE_LIMIT=5;
  function askCount(){ return parseInt(localStorage.getItem("meridianAskCount")||"0",10); }
  function askIsPro(){ return localStorage.getItem("meridianPro")==="1"; }
  function renderAskLimit(){
    if(askIsPro()){ askLimit.textContent="Pro · unlimited questions"; return; }
    var left=Math.max(0,ASK_FREE_LIMIT-askCount());
    askLimit.textContent = left>0 ? (left+" free question"+(left===1?"":"s")+" left") : "Free questions used — see Pro for unlimited";
  }
  renderAskLimit();
  askFab.addEventListener("click",function(){ askPanel.classList.toggle("show"); if(askPanel.classList.contains("show")) askInput.focus(); });
  document.getElementById("askClose").addEventListener("click",function(){ askPanel.classList.remove("show"); });
  function askAdd(q,htmlAnswer){ var row=document.createElement("div"), qd=document.createElement("div"), ad=document.createElement("div");
    qd.className="aq"; qd.textContent=q; ad.className="aa"; ad.innerHTML=htmlAnswer; row.appendChild(qd); row.appendChild(ad);
    askBody.appendChild(row); askBody.scrollTop=askBody.scrollHeight; return ad; }
  function sendAsk(){
    var q=askInput.value.trim(); if(!q) return;
    if(!askIsPro() && askCount()>=ASK_FREE_LIMIT){ askAdd(q,"You've used your free questions. <a href=\"#pricing\" style=\"color:var(--cool)\">See Meridian Pro</a> for unlimited answers."); askInput.value=""; return; }
    askInput.value=""; askInput.disabled=true; askSend.disabled=true;
    var ad=askAdd(q,"…");
    function done(text){ ad.textContent=text; askInput.disabled=false; askSend.disabled=false; }
    fetch("/api/ask",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({question:q,context:currentDetail?currentDetail.title:null})})
      .then(function(r){return r.json();})
      .then(function(d){ done(d&&d.text?d.text:"The AI tutor isn't configured yet — the site owner needs to add an API key."); if(!askIsPro()){ localStorage.setItem("meridianAskCount",String(askCount()+1)); renderAskLimit(); } })
      .catch(function(){ done("Couldn't reach the AI tutor — try again in a moment."); });
  }
  askSend.addEventListener("click",sendAsk);
  askInput.addEventListener("keydown",function(e){ if(e.key==="Enter") sendAsk(); });

  /* ===== pro modal ===== */
  var proBtn=document.getElementById("proBtn"), proModal=document.getElementById("proModal");
  if(proBtn) proBtn.addEventListener("click",function(){ proModal.classList.add("show"); });
  document.getElementById("proModalClose").addEventListener("click",function(){ proModal.classList.remove("show"); });
  proModal.addEventListener("click",function(e){ if(e.target===proModal) proModal.classList.remove("show"); });

  resize(); requestAnimationFrame(draw);
  loadData().then(function(){ dirty=true; updatePanels(); updateTimeLabel(); SIDX=buildIndex(); }).catch(function(){ locStatus.innerHTML="Could not load star catalogue (offline?)."; });
  setInterval(function(){ if(dataReady){ if(timeOffset===0&&!animating){ dirty=true; } updatePanels(); } }, 15000);
  setInterval(function(){ if(timeOffset===0&&!animating) updateClock(nowDate()); }, 1000);
})();
