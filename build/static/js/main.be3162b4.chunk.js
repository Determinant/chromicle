(window.webpackJsonp=window.webpackJsonp||[]).push([[0],{308:function(e,t,a){e.exports=a(655)},655:function(e,t,a){"use strict";a.r(t);var n=a(1),r=a.n(n),c=a(28),l=a.n(c),o=a(136),i=a(307),s=a(46),u=a(53),m=a(78),h=a(74),d=a(79),p=(a(313),a(315),a(341),a(285)),f=a(31),g=a(99),v=a.n(g),E=a(305),y=a.n(E),w=a(304),b=a.n(w),P=a(172),x=a.n(P),O=a(81),C=a.n(O),j=a(176),S=a.n(j),k=a(93),D=a.n(k),R=a(102),N=a.n(R),T=a(39),B=a.n(T),G=a(306),I=a.n(G),W=a(173),A=a.n(W),M=function(e){return r.a.createElement("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 98.905998 93.557997",version:"1.1",style:e.style},r.a.createElement("g",{id:"g13",transform:"translate(-153.533,-203.047)"},r.a.createElement("g",{id:"g29"},r.a.createElement("g",{id:"g27"},r.a.createElement("polygon",{id:"polygon7",points:"252.439,241.924 234.556,288.703 185.103,296.605 153.533,257.728 171.416,210.949 220.869,203.047 ",style:{fill:"#ff8000"}}),r.a.createElement("g",{id:"g11",transform:"translate(167.24355,224.20734)"},r.a.createElement("text",{id:"text9",style:{fontStyle:"normal",fontVariant:"normal",fontWeight:"normal",fontStretch:"normal",fontSize:75,fontFamily:"TypoPRO Fantasque Sans Mono",fill:"#ffeade"},transform:"translate(0.586,49.072)"},"Cr"))))))},_="https://www.googleapis.com/calendar/v3";function z(e){return Object.entries(e).map(function(e){var t=Object(o.a)(e,2),a=t[0],n=t[1];return"".concat(encodeURIComponent(a),"=").concat(encodeURIComponent(n))}).join("&")}function F(e){return fetch(_+"/users/me/calendarList?"+z({access_token:e}),{method:"GET",async:!0}).then(function(e){return e.json()}).then(function(e){return e.items})}function L(e){return fetch(_+"/colors?"+z({access_token:e}),{method:"GET",async:!0}).then(function(e){return e.json()})}var $=function(){function e(t,a,n,r){Object(s.a)(this,e),this.id=t,this.isRegex=a,this.value=n,this.label=r}return Object(u.a)(e,[{key:"regex",get:function(){return new RegExp(this.isRegex?this.value:"^".concat(this.value,"$"))}},{key:"isEmpty",get:function(){return null===this.label}}]),e}();$.emptyPattern=function(){return new $(0,!0,"",null)},$.anyPattern=function(){return new $("any",!0,".*","Any")};var H=function e(t,a,n,r){Object(s.a)(this,e),this.name=t,this.idx=a,this.cal=n,this.event=r};H.defaultPatternEntry=function(e){return new H("",e,$.emptyPattern(),$.anyPattern())};var J=a(298),K=a.n(J),U=a(659),V=a(657),q=a(656),X=a(554);function Y(e){var t=e.cx,a=e.cy,n=e.x,c=e.y,l=e.fill,o=e.name,i="middle",s=0,u=0;return n<t-2?(s=-5,i="end"):n>t+2&&(s=5,i="start"),c<a-2?u=-5:c>a+2&&(u=10),r.a.createElement("text",{x:n,y:c,dx:s,dy:u,fill:l,textAnchor:i},"".concat(o))}var Q=Object(f.withStyles)(function(e){return{pieChart:{margin:"0 auto"}}})(function(e){return r.a.createElement(B.a,{container:!0,spacing:0},r.a.createElement(B.a,{item:!0,xs:12,lg:6},r.a.createElement("div",{className:e.classes.patternTableWrapper},r.a.createElement(U.a,{width:400,height:250,className:e.classes.pieChart},r.a.createElement(V.a,{data:e.patternGraphData,dataKey:"value",cx:200,cy:125,outerRadius:60,fill:K.a[300],label:Y}),r.a.createElement(q.a,{formatter:function(e){return"".concat(e.toFixed(2)," hr")}})))),r.a.createElement(B.a,{item:!0,xs:12,lg:6},r.a.createElement("div",{className:e.classes.patternTableWrapper},r.a.createElement(U.a,{width:400,height:250,className:e.classes.pieChart},r.a.createElement(V.a,{data:e.calendarGraphData,dataKey:"value",cx:200,cy:125,innerRadius:40,outerRadius:70,fill:v.a[300],label:Y},e.calendarGraphData.map(function(e,t){return r.a.createElement(X.a,{key:t,fill:e.color})})),r.a.createElement(q.a,{formatter:function(e){return"".concat(e.toFixed(2)," hr")}})))))}),Z=a(135),ee=a.n(Z),te=a(300),ae=a.n(te),ne=a(302),re=a.n(ne),ce=a(139),le=a.n(ce),oe=a(100),ie=a.n(oe),se=a(301),ue=a.n(se),me=a(303),he=a.n(me),de=a(299),pe=a.n(de),fe=a(130),ge=a.n(fe),ve=a(171),Ee=a.n(ve),ye=function(e){function t(){return Object(s.a)(this,t),Object(m.a)(this,Object(h.a)(t).apply(this,arguments))}return Object(d.a)(t,e),Object(u.a)(t,[{key:"render",value:function(){var e=this,t=this.props.classes,a=[],n=this.props.options,c=new $.emptyPattern;for(var l in n[c.id]=c,n){var o=n[l].isEmpty?r.a.createElement("span",{style:{color:this.props.theme.palette.primary.dark}},"Custom"):n[l].label;a.push(r.a.createElement(Ee.a,{key:l,value:l},o))}var i=this.props.value.isRegex?t.fieldRegex:t.fieldNoRegex;return r.a.createElement(D.a,null,r.a.createElement("span",null,r.a.createElement(ge.a,{value:this.props.value.id,onChange:function(t){var a;a=null==n[t.target.value].label?new $(0,!0,e.props.value.isRegex?e.props.value.value:"^".concat(e.props.value.value,"$"),null):n[t.target.value],e.props.onChange({target:{value:a}})},className:i},a),null==this.props.value.label&&r.a.createElement(ee.a,{value:this.props.value.value,onChange:function(t){return e.props.onChange({target:{value:new $(0,!0,t.target.value,null)}})}})))}}]),t}(r.a.Component),we=Object(f.withStyles)(function(e){return{fieldNoRegex:{width:200},fieldRegex:{marginRight:"0.5em"}}})(ye);var be=a(138),Pe=a.n(be),xe=Object(f.createMuiTheme)({palette:{primary:{light:Pe.a[300],main:Pe.a[500],dark:Pe.a[700],contrastText:"#fff"}},typography:{useNextVariants:!0}}),Oe=[{label:"Name",field:"name",elem:ee.a},{label:"Calendar",field:"cal",elem:Object(f.withTheme)(xe)(function(e){var t={};for(var a in e.cached.calendars)t[a]=new $(a,!1,e.cached.calendars[a].name,e.cached.calendars[a].name);return r.a.createElement(we,{value:e.value,options:t,onChange:e.onChange,theme:e.theme})})},{label:"Event",field:"event",elem:Object(f.withTheme)(xe)(function(e){var t=$.anyPattern(),a={};return a[t.id]=t,r.a.createElement(we,{value:e.value,options:a,onChange:e.onChange,theme:e.theme})})}],Ce=function(e){function t(){var e,a;Object(s.a)(this,t);for(var n=arguments.length,r=new Array(n),c=0;c<n;c++)r[c]=arguments[c];return(a=Object(m.a)(this,(e=Object(h.a)(t)).call.apply(e,[this].concat(r)))).state={page:0,rowsPerPage:5},a}return Object(d.a)(t,e),Object(u.a)(t,[{key:"handleChangePage",value:function(e,t){this.setState({page:t})}},{key:"handleChangeRowsPerPage",value:function(e){this.setState({rowsPerPage:e.target.value})}},{key:"render",value:function(){var e=this,t=this.props,a=t.classes,n=t.cached,c=t.patterns,l=this.state,o=l.rowsPerPage,i=l.page,s=o-Math.min(o,c.length-i*o),u=c.slice(i*o,(i+1)*o).map(function(t){return r.a.createElement(le.a,{onMouseOver:function(){return e.setState({activePattern:t.idx})},onMouseOut:function(){return e.setState({activePattern:null})}},Oe.map(function(a){var c=a.elem;return r.a.createElement(ie.a,null,r.a.createElement(c,{value:t[a.field],cached:n,onChange:function(n){return e.updatePattern(a.field,t.idx,n.target.value)}}))}),r.a.createElement("span",{className:e.state.activePattern===t.idx?a.deleteButtonShow:a.deleteButtonHide},r.a.createElement(pe.a,{className:a.deleteIcon,onClick:function(){return e.removePattern(t.idx)}})))});return r.a.createElement("div",null,r.a.createElement("div",{className:a.patternTableWrapper},r.a.createElement(ae.a,{className:a.patternTable},r.a.createElement(ue.a,null,r.a.createElement(le.a,null,Oe.map(function(e,t){return r.a.createElement(ie.a,{key:t},e.label)}))),r.a.createElement(re.a,null,u,s>0&&r.a.createElement(le.a,{style:{height:48*s}},r.a.createElement(ie.a,{colSpan:Oe.length}))))),r.a.createElement(he.a,{rowsPerPageOptions:[5,10,25],component:"div",count:c.length,rowsPerPage:o,page:i,backIconButtonProps:{"aria-label":"Previous Page"},nextIconButtonProps:{"aria-label":"Next Page"},onChangePage:this.handleChangePage,onChangeRowsPerPage:this.handleChangeRowsPerPage}))}}]),t}(r.a.Component),je=Object(f.withStyles)(function(e){return{deleteButtonShow:{position:"absolute",right:0,height:48},deleteButtonHide:{display:"none"},deleteIcon:{height:"100%",cursor:"pointer"},patternTableWrapper:{overflowX:"auto",overflowY:"hidden"},patternTable:{minWidth:600}}})(Ce),Se=[{name:"Work",value:10,color:v.a[300]},{name:"Wasted",value:10,color:v.a[300]}];var ke=function(e){function t(){var e,a;Object(s.a)(this,t);for(var n=arguments.length,r=new Array(n),c=0;c<n;c++)r[c]=arguments[c];return(a=Object(m.a)(this,(e=Object(h.a)(t)).call.apply(e,[this].concat(r)))).state={patterns:[],timeRange:null,token:new Promise(function(e){return chrome.identity.getAuthToken({interactive:!0},function(t){return e(t)})}),patternGraphData:Se,calendarGraphData:Se,activePattern:null},a.cached={calendars:{}},a.handleChangePage=function(e,t){a.setState({page:t})},a.handleChangeRowsPerPage=function(e){a.setState({rowsPerPage:e.target.value})},a.updatePattern=function(e,t,n){var r=a.state.patterns;r[t][e]=n,a.setState({patterns:r})},a.removePattern=function(e){var t=a.state.patterns;t.splice(e,1);for(var n=0;n<t.length;n++)t[n].idx=n;a.setState({patterns:t})},a.newPattern=function(){for(var e=[H.defaultPatternEntry()].concat(Object(i.a)(a.state.patterns)),t=1;t<e.length;t++)e[t].idx=t;a.setState({patterns:e})},a.analyze=function(){if(a.state.startDate&&a.state.endDate){var e=a.state.startDate.toISOString(),t=a.state.endDate.toISOString(),n=[],r=function(r){var c,l,o;n.push(a.state.token.then((c=r,l=e,o=t,function(e){return fetch(_+"/calendars/"+c+"/events?"+z({access_token:e,timeMin:l,timeMax:o}),{method:"GET",async:!0}).then(function(e){if(200===e.status)return e.json();throw"got response ".concat(e.status)}).catch(function(e){return console.log(e),[]}).then(function(e){return e.items})})).then(function(e){return a.cached.calendars[r].events=e}))};for(var c in a.cached.calendars)r(c);Promise.all(n).then(function(){for(var e={},t={},n=0;n<a.state.patterns.length;n++)e[n]=0;var r=function(n){var r=function(e,t){return e.filter(function(e){return e.cal.regex.test(t)})}(a.state.patterns,a.cached.calendars[n].name);if(!a.cached.calendars[n].events)return"continue";a.cached.calendars[n].events.forEach(function(a){"confirmed"===a.status&&r.forEach(function(r){if(r.event.regex.test(a.summary)){void 0===t[n]&&(t[n]=0);var c=(new Date(a.end.dateTime)-new Date(a.start.dateTime))/6e4;e[r.idx]+=c,t[n]+=c}})})};for(var c in a.cached.calendars)r(c);for(var l=[],o=[],i=0;i<a.state.patterns.length;i++)l.push({name:a.state.patterns[i].name,value:e[i]/60});for(var c in t)o.push({name:a.cached.calendars[c].name,value:t[c]/60,color:a.cached.calendars[c].color.background});a.setState({patternGraphData:l,calendarGraphData:o})})}else alert("Please choose a valid time range.")},a.loadPatterns=function(){var e=a.state.token,t=e.then(L).then(function(e){return e.calendar}),n=e.then(F);Promise.all([t,n]).then(function(e){var t=Object(o.a)(e,2),n=t[0],r=t[1];r.forEach(function(e){a.cached.calendars[e.id]={name:e.summary,events:{},color:n[e.colorId]}}),a.setState({patterns:r.map(function(e,t){return new H(e.summary,t,new $(e.id,!1,e.summary,e.summary),$.anyPattern())})})})},a}return Object(d.a)(t,e),Object(u.a)(t,[{key:"render",value:function(){var e=this,t=this.props.classes;return r.a.createElement(f.MuiThemeProvider,{theme:xe},r.a.createElement("div",{className:t.root},r.a.createElement(b.a,{position:"absolute",className:t.appBar},r.a.createElement(x.a,{className:t.toolbar},r.a.createElement(C.a,{component:"h1",variant:"h6",color:"inherit",noWrap:!0,className:t.title},r.a.createElement(M,{style:{width:"2em",verticalAlign:"bottom",marginRight:"0.2em"}}),"Chromicle"))),r.a.createElement("main",{className:t.content},r.a.createElement("div",{className:t.appBarSpacer}),r.a.createElement(B.a,{container:!0,spacing:16},r.a.createElement(y.a,null),r.a.createElement(B.a,{item:!0,md:6,xs:12},r.a.createElement(D.a,{fullWidth:!0},r.a.createElement(N.a,null,r.a.createElement(C.a,{variant:"h6",component:"h1",gutterBottom:!0},"Event Patterns",r.a.createElement(A.a,{style:{marginBottom:"0.12em",marginLeft:"0.5em"},onClick:function(){return e.newPattern()}},r.a.createElement(I.a,null))),r.a.createElement(je,{patterns:this.state.patterns,cached:this.cached})),r.a.createElement(N.a,null,r.a.createElement(C.a,{variant:"h6",component:"h1",gutterBottom:!0},"Time Range"),r.a.createElement("div",{style:{textAlign:"center"}},r.a.createElement(p.DateRangePicker,{startDate:this.state.startDate,startDateId:"start_date_id",endDate:this.state.endDate,endDateId:"end_date_id",onDatesChange:function(t){var a=t.startDate,n=t.endDate;e.setState({startDate:a,endDate:n})},focusedInput:this.state.focusedInput,onFocusChange:function(t){return e.setState({focusedInput:t})},isOutsideRange:function(){return!1}}))),r.a.createElement("div",{className:t.buttonSpacer}),r.a.createElement(B.a,{container:!0,spacing:16},r.a.createElement(B.a,{item:!0,md:6,xs:12},r.a.createElement(N.a,null,r.a.createElement(S.a,{variant:"contained",color:"primary",onClick:this.loadPatterns},"Load"))),r.a.createElement(B.a,{item:!0,md:6,xs:12},r.a.createElement(N.a,null,r.a.createElement(S.a,{variant:"contained",color:"primary",onClick:this.analyze},"Analyze")))))),r.a.createElement(B.a,{item:!0,md:6,xs:12},r.a.createElement(C.a,{variant:"h6",component:"h1",gutterBottom:!0},"Graph"),r.a.createElement(Q,{patternGraphData:this.state.patternGraphData,calendarGraphData:this.state.calendarGraphData}))))))}}]),t}(r.a.Component),De=Object(f.withStyles)(function(e){return{root:{display:"flex",height:"100vh"},appBar:{zIndex:e.zIndex.drawer+1,transition:e.transitions.create(["width","margin"],{easing:e.transitions.easing.sharp,duration:e.transitions.duration.leavingScreen})},title:{flexGrow:1},sectionTitle:{flex:"0 0 auto"},appBarSpacer:e.mixins.toolbar,content:{flexGrow:1,padding:3*e.spacing.unit,overflow:"auto"},buttonSpacer:{marginBottom:4*e.spacing.unit},fab:{margin:e.spacing.unit}}})(ke);Boolean("localhost"===window.location.hostname||"[::1]"===window.location.hostname||window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/));l.a.render(r.a.createElement(De,null),document.getElementById("root")),"serviceWorker"in navigator&&navigator.serviceWorker.ready.then(function(e){e.unregister()})}},[[308,2,1]]]);
//# sourceMappingURL=main.be3162b4.chunk.js.map