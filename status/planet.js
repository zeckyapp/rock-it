/* Rock it's planet: Earth, Mars or the Moon, drawn on a canvas.
   Peer dots land at random places; they never show where a peer is.
   The Earth's land comes from Natural Earth (public domain), as a
   144 x 72 mask. Mars and the Moon are painted from a few known features
   and seeded noise, so they look the same every time. */
(function(){
var LAND="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/5///gAAAAAAAAAAAAAAAAEz/P//8ABwAAAADAAAAAAAABKZAP//8AAAAA4AH4AAAAAAADwDQAP/8AAAAGAH/4AIAAgEAAfG/gH/4AAAAGHf//9/gAB///1Ds4H/gAAf4F6///////8/////w+H8BAB/0/////////AP////UcHwCAD3/////////+A////8BgDgAAPn////////74AeB//+B6AAAAPn///////4CAAIAf//h+AAACFP///////gOAAAAP//7/gAANH////////wMAAAAH////wAAD/////////wAAAAAD///04AAD/////////wAAAAAD///8AAAB//X//////gAAAAAD///wAAAB6+D//////EAAAAAD///gAAAPhvb/////8IAAAAAB///AAAAPAp/////+IIAAAAAB///AAAAA8Af/////EwAAAAAAf/+AAAAH8AP/////BAAAAAAAX/4AAAAP/uv/////gAAAAAAAP8EAAAAP///v////gAAAAAAAD4EAAAA///3z////AAAAAAAAB4AAAAA///3+H//+gAAAAAAAA4gAAAB///7/D+fgAAAAAAAAA9gYAAA///7+B8PQAAAAAAAAAHgAAAB///94B4HggAAAAAAAAA4AAAB////gAwHwwAAAAAAAAAAoAAA///+QAwFgAAAAAAAAAAF/AAAf///wAAEAIAAAAAAAAAB/gAAPv//wAICAAAAAAAAAAAB/8AAAD//gAAGGAAAAAAAAAAD/8AAAD//AAADOAAAAAAAAAAD//AAAD/+AAADOjAAAAAAAAAD//4AAD/8AAABAg8AAAAAAAAD//8AAB/8AAAAgAeAAAAAAAAD//8AAB/8AAAABoIAAAAAAAAB//4AAB/8AAAAAAAAAAAAAAAB//wAAB/8QAAAADAAAAAAAAAAf/wAAB/8wAAAAfkAAAAAAAAAP/wAAB/wwAAAAf+AAAAAAAAAP/wAAB/xgAAAD//AAAAAAAAAP/AAAA/xgAAAH//AAAAAAAAAP+AAAA/gAAAAH//gAAAAAAAAf8AAAAfgAAAAD//gAAAAAAAAf8AAAAfAAAAAD//gAAAAAAAAf4AAAAcAAAAADw/gAAAAAAAAfgAAAAAAAAAAAAPAAAAAAAAAfAAAAAAAAAAAAACACAAAAAAA8AAAAAAAAAAAAACAEAAAAAAAcAAAAAAAAAAAAAAAIAAAAAAA4AAAAAAAAAAAAAAAQAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAwgAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAACAAAAAAAGAABEAAAAAAAAAAAEAAAAAAR/8f////gAAAAAAAA+AAAF////5//////wAAABAf+/AAB////////////gAAP////wAAP///////////+AAT////+ADj/////////////gAD/////4AH////////////8AAB/////////////////////w////////////////////////////////////////////////"; // 144 x 72 world land mask, from Natural Earth (public domain)

  var W0=144,H0=72,bits=atob(LAND),land=[];
  for(var r=0;r<H0;r++)for(var c=0;c<W0;c++){var i=r*W0+c;if(bits.charCodeAt(i>>3)>>(7-(i&7))&1)land.push([r,c]);}

  var cv=document.getElementById('globe'),x=cv.getContext('2d'),dpr=Math.min(2,devicePixelRatio||1),W,H,cx,cy,R;
  function size(){var b=cv.getBoundingClientRect();W=b.width;H=b.height;cv.width=W*dpr;cv.height=H*dpr;x.setTransform(dpr,0,0,dpr,0,0);cx=W/2;cy=H*0.47;R=Math.min(W,H)*0.3;}
  size();if(window.ResizeObserver)new ResizeObserver(function(){size();if(reduce)draw();}).observe(cv);else addEventListener('resize',size);
  var planet='earth';
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
  var progress=0,frames=0,spin=0,tilt=0.38,parts=[],rings=[],peers=[],lastHit=-9e9,t0=performance.now();

  function project(r,c){ // grid cell -> screen, z>0 is the front side
    var lat=(90-(r+0.5)*180/H0)*Math.PI/180,lon=(-180+(c+0.5)*360/W0)*Math.PI/180+spin;
    var X=Math.cos(lat)*Math.sin(lon),Y=Math.sin(lat),Z=Math.cos(lat)*Math.cos(lon);
    var y2=Y*Math.cos(tilt)-Z*Math.sin(tilt),z2=Y*Math.sin(tilt)+Z*Math.cos(tilt);
    return [cx+X*R,cy-y2*R,z2];
  }
  function newPeer(){var cell=planet==='earth'?land[Math.floor(Math.random()*land.length)]:[Math.floor(8+Math.random()*(H0-16)),Math.floor(Math.random()*W0)];return {cell:cell,born:performance.now(),life:5000+Math.random()*6000};}
  var peerTarget=0;
  function fitPeers(){while(peers.length<peerTarget){var p=newPeer();p.born-=Math.random()*5000;peers.push(p);}peers.length=Math.min(peers.length,peerTarget);}


  // ---- Mars: a procedural map with real landmarks, painted pixel by pixel ----
  var TW=512,TH=256,tex=null,seed=1;
  function rnd(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646;}
  function h3(a,b,c){var s=Math.sin(a*127.1+b*311.7+c*74.7)*43758.5453;return s-Math.floor(s);}
  function n3(a,b,c){var ai=Math.floor(a),bi=Math.floor(b),ci=Math.floor(c),af=a-ai,bf=b-bi,cf=c-ci,u=af*af*(3-2*af),v=bf*bf*(3-2*bf),w=cf*cf*(3-2*cf);
    function L(p,q,s){return p+(q-p)*s;}
    return L(L(L(h3(ai,bi,ci),h3(ai+1,bi,ci),u),L(h3(ai,bi+1,ci),h3(ai+1,bi+1,ci),u),v),L(L(h3(ai,bi,ci+1),h3(ai+1,bi,ci+1),u),L(h3(ai,bi+1,ci+1),h3(ai+1,bi+1,ci+1),u),v),w);}
  function fbm(a,b,c,o){var s=0,k=0.5,f=1;for(var i=0;i<o;i++){s+=k*n3(a*f,b*f,c*f);f*=2.03;k*=0.5;}return s;}
  function sm(e0,e1,v){v=Math.max(0,Math.min(1,(v-e0)/(e1-e0)));return v*v*(3-2*v);}
  function buildMars(){
    seed=4242;
    tex=new Uint8ClampedArray(TW*TH*3);var D=Math.PI/180;
    function gb(lon,lat,lo0,la0,s){var dl=((lon-lo0+540)%360)-180,cl=Math.cos(lat*D);return Math.exp(-((dl*cl)*(dl*cl)+(lat-la0)*(lat-la0))/(s*s));}
    for(var v=0;v<TH;v++){var lat=90-(v+0.5)*180/TH,la=lat*D;
      for(var u=0;u<TW;u++){var lon=-180+(u+0.5)*360/TW,lo=lon*D,px=Math.cos(la)*Math.cos(lo),py=Math.sin(la),pz=Math.cos(la)*Math.sin(lo);
        var n=fbm(px*2.2+5,py*2.2,pz*2.2,5);
        var maria=Math.exp(-Math.pow((lat+14)/26,2))*0.15+0.24*gb(lon,lat,70,8,13)+0.15*gb(lon,lat,-30,46,15)+0.12*gb(lon,lat,-22,-20,20)+0.11*gb(lon,lat,125,-24,20)+0.08*gb(lon,lat,-85,-22,14);
        var dk=sm(0.5,0.68,n*0.9+maria);
        var br=0.4*gb(lon,lat,70,-42,13)+0.22*gb(lon,lat,-42,-50,9)+0.18*gb(lon,lat,-112,6,24)+0.12*gb(lon,lat,160,22,22);
        var r=184+(96-184)*dk,g=112+(56-112)*dk,b=70+(38-70)*dk;
        r+=(220-r)*br;g+=(160-g)*br;b+=(110-b)*br;
        if(lon>-108&&lon<-38){var c=-8+1.5*Math.sin((lon+70)/14),d=Math.abs(lat-c);var vm=Math.exp(-(d/0.9)*(d/0.9))*0.35*sm(-108,-96,lon)*(1-sm(-50,-38,lon));r*=1-vm;g*=1-vm;b*=1-vm;}
        var om=gb(lon,lat,-134,18,4.5);r+=om*22;g+=om*14;b+=om*8;
        var gr=1+(fbm(px*20,py*20,pz*20,3)-0.46)*0.32;r*=gr;g*=gr;b*=gr;
        var cap=Math.max(sm(77,83,lat+(n-0.5)*9),0.9*sm(80,85,-lat+(n-0.5)*7));
        r+=(236-r)*cap;g+=(230-g)*cap;b+=(222-b)*cap;
        var k=(v*TW+u)*3;tex[k]=r;tex[k+1]=g;tex[k+2]=b;}}
    for(var i=0;i<130;i++){var cla=Math.asin(2*rnd()-1)/D,clo=rnd()*360-180,rd=0.5+Math.pow(rnd(),3)*7,cl=Math.max(0.15,Math.cos(cla*D));
      var v0=Math.max(0,Math.floor((90-cla-rd*1.4)*TH/180)),v1=Math.min(TH-1,Math.ceil((90-cla+rd*1.4)*TH/180)),du=Math.ceil(rd*1.4/cl*TW/360);
      var uc=Math.floor((clo+180)*TW/360);
      for(var vv=v0;vv<=v1;vv++)for(var uu=uc-du;uu<=uc+du;uu++){var lat2=90-(vv+0.5)*180/TH,lon2=-180+(uu+0.5)*360/TW,dl=(lon2-clo)*cl,d=Math.sqrt(dl*dl+(lat2-cla)*(lat2-cla))/rd;
        if(d>1.25)continue;var f=d<0.82?0.9+0.08*d:(d<1.02?1.06:1-0.05*(1.25-d)/0.23);var kk=(vv*TW+((uu%TW)+TW)%TW)*3;tex[kk]*=f;tex[kk+1]*=f;tex[kk+2]*=f;}}
  }
  var buf=document.createElement('canvas'),bx=buf.getContext('2d'),BS=0,img,lonB,vI,sh,al;
  function prep(){BS=Math.min(380,Math.round(2*R));buf.width=buf.height=BS;img=bx.createImageData(BS,BS);
    lonB=new Float32Array(BS*BS);vI=new Int32Array(BS*BS);sh=new Float32Array(BS*BS);al=new Uint8ClampedArray(BS*BS);
    var Lx=-0.5,Ly=0.48,Lz=0.72,ct=Math.cos(tilt),st=Math.sin(tilt);
    for(var j=0;j<BS;j++)for(var i=0;i<BS;i++){var k=j*BS+i,nx=(i+0.5)/BS*2-1,ny=(j+0.5)/BS*2-1,r2=nx*nx+ny*ny;if(r2>=1){al[k]=0;continue;}
      var nz=Math.sqrt(1-r2),y2=-ny,Y=y2*ct+nz*st,Z=-y2*st+nz*ct;
      lonB[k]=(Math.atan2(nx,Z)+Math.PI)/(2*Math.PI)*TW;vI[k]=Math.min(TH-1,Math.floor((90-Math.asin(Math.max(-1,Math.min(1,Y)))*180/Math.PI)/180*TH));
      var lam=Math.max(0,nx*Lx+y2*Ly+nz*Lz);sh[k]=(0.14+1.0*Math.pow(lam,0.85))*(0.78+0.22*nz);al[k]=Math.min(1,(1-Math.sqrt(r2))*BS*0.5)*255;}}
  function drawTex(T,tr,tg,tb){
    if(BS!==Math.min(380,Math.round(2*R)))prep();
    var d=img.data,off=spin/(2*Math.PI)*TW;
    for(var k=0;k<BS*BS;k++){var o=k*4;if(!al[k]){d[o+3]=0;continue;}var uu=Math.floor(((lonB[k]-off)%TW+TW)%TW),t3=(vI[k]*TW+uu)*3,s=sh[k];
      d[o]=T[t3]*s*tr;d[o+1]=T[t3+1]*s*tg;d[o+2]=T[t3+2]*s*tb;d[o+3]=al[k];}
    bx.putImageData(img,0,0);x.drawImage(buf,cx-R,cy-R,2*R,2*R);
  }
  function drawMars(){if(!tex)buildMars();drawTex(tex,1,0.97,0.95);}
  function drawMoon(){if(!mtex)buildMoon();drawTex(mtex,0.9,0.9,0.93);}

  // ---- Moon: grey highlands, the dark seas of the near side, craters and bright rays ----
  var mtex=null;
  function buildMoon(){
    seed=1969;
    mtex=new Uint8ClampedArray(TW*TH*3);var D=Math.PI/180;
    function gb(lon,lat,lo0,la0,s){var dl=((lon-lo0+540)%360)-180,cl=Math.cos(lat*D);return Math.exp(-((dl*cl)*(dl*cl)+(lat-la0)*(lat-la0))/(s*s));}
    var seas=[[-16,33,11],[18,28,8],[31,8,9],[59,17,5],[51,-8,7],[-17,-21,8],[-57,18,16],[-40,-4,10],[35,-15,4],[2,57,6],[-20,57,6],[-5,10,6]];
    var rays=[[-11,-43,34,3]];
    for(var v=0;v<TH;v++){var lat=90-(v+0.5)*180/TH,la=lat*D;
      for(var u=0;u<TW;u++){var lon=-180+(u+0.5)*360/TW,lo=lon*D,px=Math.cos(la)*Math.cos(lo),py=Math.sin(la),pz=Math.cos(la)*Math.sin(lo);
        var n=fbm(px*3+2,py*3,pz*3+7,5),m=0;for(var q=0;q<seas.length;q++)m=Math.max(m,gb(lon,lat,seas[q][0],seas[q][1],seas[q][2]));
        var dk=sm(0.22,0.6,m+(n-0.5)*0.45),base=168+(n-0.5)*30,c=base+(96-base)*dk;
        for(var rr=0;rr<rays.length;rr++){var R0=rays[rr],dl=(((lon-R0[0]+540)%360)-180)*Math.cos(R0[1]*D),dd=lat-R0[1],dist=Math.sqrt(dl*dl+dd*dd),ang=Math.atan2(dd,dl);
          var rn=n3(Math.cos(ang)*5+R0[3],Math.sin(ang)*5,R0[3]);c+=38*sm(0.62,0.88,rn)*Math.exp(-dist/R0[2])*sm(1.5,4,dist)+40*Math.exp(-dist*dist/6);}
        c*=1+(fbm(px*22,py*22,pz*22,3)-0.46)*0.32;
        var k=(v*TW+u)*3;mtex[k]=c;mtex[k+1]=c*0.99;mtex[k+2]=c*0.97;}}
    for(var i=0;i<360;i++){var cla=Math.asin(2*rnd()-1)/D,clo=rnd()*360-180,rd=0.4+Math.pow(rnd(),4)*7,cl=Math.max(0.15,Math.cos(cla*D));
      var v0=Math.max(0,Math.floor((90-cla-rd*1.4)*TH/180)),v1=Math.min(TH-1,Math.ceil((90-cla+rd*1.4)*TH/180)),du=Math.ceil(rd*1.4/cl*TW/360),uc=Math.floor((clo+180)*TW/360);
      for(var vv=v0;vv<=v1;vv++)for(var uu=uc-du;uu<=uc+du;uu++){var lat2=90-(vv+0.5)*180/TH,lon2=-180+(uu+0.5)*360/TW,dl2=(lon2-clo)*cl,d=Math.sqrt(dl2*dl2+(lat2-cla)*(lat2-cla))/rd;
        if(d>1.25)continue;var f=d<0.8?0.9+0.08*d:(d<1.02?1.05:1-0.05*(1.25-d)/0.23);var kk=(vv*TW+((uu%TW)+TW)%TW)*3;mtex[kk]*=f;mtex[kk+1]*=f;mtex[kk+2]*=f;}}
  }


  // ---- Easter egg: a little red car out for a drive on Mars ----
  var car=null,nextCar=performance.now()+(30+Math.random()*90)*60000,egg=document.getElementById('egg');
  function projLL(la,lo){var X=Math.cos(la)*Math.sin(lo+spin),Y=Math.sin(la),Z=Math.cos(la)*Math.cos(lo+spin);return [cx+X*R,cy-(Y*Math.cos(tilt)-Z*Math.sin(tilt))*R,Y*Math.sin(tilt)+Z*Math.cos(tilt)];}
  function startCar(){if(planet!=='mars'||car)return;egg.textContent='Someone left a car running out there.';car={t0:performance.now(),dur:42000,la:(Math.random()*24-6)*Math.PI/180,lo0:-spin-1.0,trail:[]};egg.classList.add('on');}
  function carPos(s){return [car.la+0.05*Math.sin(s/3),car.lo0-0.05*s];}
  function drawCar(now){
    if(!car)return;var s=(now-car.t0)/1000;if(s*1000>car.dur||planet!=='mars'){car=null;egg.classList.remove('on');return;}
    var p=carPos(s),a=projLL(p[0],p[1]),b=projLL.apply(null,carPos(s+0.6));
    var fade=Math.min(1,s/3,(car.dur/1000-s)/3)*Math.min(1,a[2]*3);if(fade<=0)return;
    if(Math.floor(s*10)!==car.last){car.last=Math.floor(s*10);car.trail.push(p);if(car.trail.length>36)car.trail.shift();}
    for(var i=0;i<car.trail.length;i++){var q=projLL(car.trail[i][0],car.trail[i][1]);if(q[2]<=0)continue;x.fillStyle='rgba(214,170,130,'+(0.5*i/car.trail.length*fade)+')';x.beginPath();x.arc(q[0],q[1],1.2+1.6*(1-i/car.trail.length),0,Math.PI*2);x.fill();}
    var sz=Math.max(11,R/11)*(0.6+0.4*a[2]),ang=Math.atan2(b[1]-a[1],b[0]-a[0]);
    x.save();x.translate(a[0],a[1]);x.rotate(ang);x.globalAlpha=fade;
    x.fillStyle='rgba(0,0,0,.35)';x.beginPath();x.ellipse(1,sz*0.22,sz*0.75,sz*0.3,0,0,Math.PI*2);x.fill();
    x.fillStyle='#16181C';[[-0.45,-0.33],[0.38,-0.33],[-0.45,0.33],[0.38,0.33]].forEach(function(w){x.fillRect(w[0]*sz-sz*0.1,w[1]*sz-sz*0.06,sz*0.2,sz*0.12);});
    x.fillStyle='#D3262E';x.beginPath();x.roundRect(-sz*0.7,-sz*0.28,sz*1.4,sz*0.56,sz*0.22);x.fill();
    x.fillStyle='#2B3038';x.beginPath();x.roundRect(-sz*0.02,-sz*0.2,sz*0.3,sz*0.4,sz*0.1);x.fill();
    x.fillStyle='rgba(255,255,255,.35)';x.fillRect(-sz*0.55,-sz*0.2,sz*0.4,sz*0.06);
    x.restore();x.globalAlpha=1;
  }

  // ---- Easter egg: a rocket comes down from space and lands on the Moon ----
  var rocket=null,nextRocket=performance.now()+(30+Math.random()*90)*60000;
  function startRocket(){if(planet!=='moon'||rocket)return;rocket={t0:performance.now()};egg.textContent='Touchdown.';egg.classList.add('on');}
  function drawRocket(now){
    if(!rocket)return;var s=(now-rocket.t0)/1000;if(s>20||planet!=='moon'){rocket=null;egg.classList.remove('on');return;}
    var h=Math.max(48,R*0.34),gx=cx,land=cy-R*Math.cos(tilt)+3,y0=-30,p=Math.min(1,s/9),e=1-Math.pow(1-p,3),by=y0+(land-y0)*e,w=h*0.15;
    x.save();x.globalAlpha=s>17?Math.max(0,1-(s-17)/3):Math.min(1,s/0.6);
    if(s<9.2){var fl=h*(0.22+0.4*(1-e))*(0.85+0.3*Math.random()),fg=x.createLinearGradient(0,by,0,by+fl);
      fg.addColorStop(0,'rgba(255,250,235,0.95)');fg.addColorStop(0.4,'rgba(255,190,90,0.8)');fg.addColorStop(1,'rgba(255,120,40,0)');
      x.fillStyle=fg;x.beginPath();x.moveTo(gx-w*0.4,by);x.quadraticCurveTo(gx,by+fl*1.3,gx+w*0.4,by);x.fill();}
    if(s>7.6&&s<12.5){var ds=(s-7.6)/4.9;x.strokeStyle='rgba(215,215,220,'+(0.55*(1-ds))+')';x.lineWidth=2;x.beginPath();x.ellipse(gx,land,w+h*0.9*ds,h*0.05+h*0.16*ds,0,Math.PI,2*Math.PI);x.stroke();}
    x.strokeStyle='#8A9098';x.lineWidth=1.6;x.beginPath();x.moveTo(gx-w*0.45,by-h*0.14);x.lineTo(gx-w*1.05,by);x.moveTo(gx+w*0.45,by-h*0.14);x.lineTo(gx+w*1.05,by);x.stroke();
    var bg=x.createLinearGradient(gx-w/2,0,gx+w/2,0);bg.addColorStop(0,'#8F959D');bg.addColorStop(0.45,'#EDEFF2');bg.addColorStop(1,'#757B83');
    x.fillStyle=bg;x.beginPath();x.moveTo(gx-w/2,by);x.lineTo(gx-w/2,by-h*0.72);x.quadraticCurveTo(gx-w/2,by-h,gx,by-h);x.quadraticCurveTo(gx+w/2,by-h,gx+w/2,by-h*0.72);x.lineTo(gx+w/2,by);x.closePath();x.fill();
    x.fillStyle='#2A2F38';x.beginPath();x.arc(gx,by-h*0.64,w*0.17,0,2*Math.PI);x.fill();
    x.restore();
  }
  document.getElementById('dot').addEventListener('click',function(){if(planet==='mars')startCar();else if(planet==='moon')startRocket();});

  function frame(now){
    if(!reduce)requestAnimationFrame(frame);
    if(W<700&&(frames++&1))return;
    draw(now);
  }
  function draw(now){
    now=now||performance.now();
    x.clearRect(0,0,W,H);
    var gold=css('--gold'),grey=css('--grey'),fg=css('--fg');
    // rosette behind
    x.save();x.translate(cx,cy);x.rotate((now-t0)/120000);x.strokeStyle=gold;x.globalAlpha=0.09;x.lineWidth=0.7;
    for(var i=0;i<32;i++){x.beginPath();x.ellipse(0,0,R*1.95,R*0.78,i*Math.PI/32,0,Math.PI*2);x.stroke();}
    x.restore();x.globalAlpha=1;
    if(planet==='earth'){
      var g=x.createRadialGradient(cx-R*0.35,cy-R*0.4,R*0.1,cx,cy,R*1.05);
      g.addColorStop(0,'#232835');g.addColorStop(0.75,'#141821');g.addColorStop(1,'#0C0E13');
      x.fillStyle=g;x.beginPath();x.arc(cx,cy,R,0,Math.PI*2);x.fill();
      var dot=Math.max(1.1,R/150);x.fillStyle='rgba(236,232,223,0.55)';
      for(var j=0;j<land.length;j++){var q=project(land[j][0],land[j][1]);if(q[2]>0.02){x.globalAlpha=Math.min(1,q[2]*1.6);x.beginPath();x.arc(q[0],q[1],dot*(0.6+q[2]*0.5),0,Math.PI*2);x.fill();}}
      x.globalAlpha=1;
    } else if(planet==='mars')drawMars(); else drawMoon();
    // atmosphere rim
    var a=x.createRadialGradient(cx,cy,R*0.92,cx,cy,R*1.12);a.addColorStop(0,'rgba(0,0,0,0)');a.addColorStop(0.5,planet==='earth'?'rgba(212,166,87,0.18)':planet==='mars'?'rgba(220,140,90,0.16)':'rgba(200,205,215,0.10)');a.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=a;x.beginPath();x.arc(cx,cy,R*1.12,0,Math.PI*2);x.fill();
    // the ring
    x.strokeStyle=gold;x.lineWidth=2.5;
    if(progress<1){x.globalAlpha=0.16;x.beginPath();x.arc(cx,cy,R*1.32,0,Math.PI*2);x.stroke();}
    if(progress>0){x.globalAlpha=0.9;x.beginPath();x.arc(cx,cy,R*1.32,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,progress));x.stroke();}
    x.globalAlpha=1;
    // glow when shielded transactions go in
    var glow=Math.max(0,1-(now-lastHit)/1400);
    if(glow>0){var gg=x.createRadialGradient(cx,cy,0,cx,cy,R);gg.addColorStop(0,'rgba(212,166,87,'+(0.28*glow)+')');gg.addColorStop(1,'rgba(212,166,87,0)');x.fillStyle=gg;x.beginPath();x.arc(cx,cy,R,0,Math.PI*2);x.fill();}
    // peers: blink up somewhere, fade, come back elsewhere
    for(var pI=0;pI<peers.length;pI++){var P=peers[pI],age=(now-P.born)/P.life;if(age>1){peers[pI]=newPeer();continue;}
      var s=project(P.cell[0],P.cell[1]);if(s[2]<=0.05)continue;var al=Math.sin(Math.PI*age)*s[2];
      x.fillStyle=gold;x.globalAlpha=al;x.beginPath();x.arc(s[0],s[1],2.6,0,Math.PI*2);x.fill();
      x.strokeStyle=gold;x.globalAlpha=al*0.5;x.beginPath();x.arc(s[0],s[1],4+8*age,0,Math.PI*2);x.stroke();}
    x.globalAlpha=1;
    // arrival rings and transactions
    rings=rings.filter(function(r){r.r+=(R*1.32-r.r)*0.05;r.a-=0.012;x.strokeStyle=gold;x.globalAlpha=Math.max(0,r.a*0.45);x.lineWidth=1.2;x.beginPath();x.arc(cx,cy,r.r,0,Math.PI*2);x.stroke();return r.a>0;});
    x.globalAlpha=1;
    parts=parts.filter(function(p){p.life++;p.ang+=0.003;
      if(p.s){p.d+=(R*0.1-p.d)*0.03;}else{p.d+=(R*1.5-p.d)*0.05;}
      var px=cx+Math.cos(p.ang)*p.d,py=cy+Math.sin(p.ang)*p.d*0.92;
      if(p.s){var inside=p.d<R,al=inside?Math.max(0,(p.d-R*0.25)/(R*0.75)):1;if(inside&&!p.hit){p.hit=1;lastHit=now;}
        x.fillStyle=gold;x.globalAlpha=al;x.beginPath();x.arc(px,py,3.2,0,Math.PI*2);x.fill();x.globalAlpha=1;return al>0.03;}
      var f=p.life>900?Math.max(0,1-(p.life-900)/140):1;x.fillStyle=grey;x.globalAlpha=f;x.beginPath();x.arc(px,py,3,0,Math.PI*2);x.fill();x.globalAlpha=1;return f>0;});
    if(planet==='mars'&&!car&&now>nextCar){startCar();nextCar=now+(30+Math.random()*90)*60000;}
    if(planet==='moon'&&!rocket&&now>nextRocket){startRocket();nextRocket=now+(30+Math.random()*90)*60000;}
    drawCar(now);drawRocket(now);
    spin+=reduce?0:(W<700?0.0032:0.0016);
  }
  requestAnimationFrame(frame);

  // What the page tells the picture.
  window.Planet={
    set:function(name){if(name!==planet&&/^(earth|mars|moon)$/.test(name)){planet=name;peers=peers.map(newPeer);if(reduce)draw();}},
    progress:function(p){progress=Math.max(0,Math.min(1,+p||0));if(reduce)draw();},
    peers:function(n){peerTarget=Math.max(0,Math.min(20,n|0));fitPeers();if(reduce)draw();},
    // A new block: its transactions arrive as dots; shielded ones sink in.
    block:function(tx,shielded){
      var n=Math.min(24,tx|0),s=Math.min(n,Math.round((shielded|0)*n/Math.max(1,tx|0)));
      rings.push({r:R*2.4,a:1});
      for(var i=0;i<n;i++)parts.push({ang:Math.random()*Math.PI*2,d:R*(2.1+Math.random()*0.5),s:i<s,life:0});
    }
  };

})();
