(window.webpackJsonp=window.webpackJsonp||[]).push([[0],{308:function(e,t,a){e.exports=a(655)},655:function(e,t,a){"use strict";a.r(t);var n=a(1),r=a.n(n),c=a(28),o=a.n(c),i=a(137),l=a(101),s=a(39),u=a(45),h=a(78),m=a(74),d=a(79),p=(a(313),a(315),a(341),a(286)),f=a(31),v=a(99),g=a.n(v),E=a(306),y=a.n(E),w=a(305),b=a.n(w),P=a(173),x=a.n(P),k=a(81),S=a.n(k),C=a(177),D=a.n(C),T=a(93),O=a.n(T),j=a(103),R=a.n(j),N=a(40),B=a.n(N),G=a(307),I=a.n(G),W=a(174),K=a.n(W),A=function(e){return r.a.createElement("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 98.905998 93.557997",version:"1.1",style:e.style},r.a.createElement("g",{id:"g13",transform:"translate(-153.533,-203.047)"},r.a.createElement("g",{id:"g29"},r.a.createElement("g",{id:"g27"},r.a.createElement("polygon",{id:"polygon7",points:"252.439,241.924 234.556,288.703 185.103,296.605 153.533,257.728 171.416,210.949 220.869,203.047 ",style:{fill:"#ff8000"}}),r.a.createElement("g",{id:"g11",transform:"translate(167.24355,224.20734)"},r.a.createElement("text",{id:"text9",style:{fontStyle:"normal",fontVariant:"normal",fontWeight:"normal",fontStretch:"normal",fontSize:75,fontFamily:"TypoPRO Fantasque Sans Mono",fill:"#ffeade"},transform:"translate(0.586,49.072)"},"Cr"))))))},_="https://www.googleapis.com/calendar/v3";function M(e){return Object.entries(e).map(function(e){var t=Object(i.a)(e,2),a=t[0],n=t[1];return"".concat(encodeURIComponent(a),"=").concat(encodeURIComponent(n))}).join("&")}function z(){return new Promise(function(e){return chrome.identity.getAuthToken({interactive:!0},function(t){return e(t)})})}function F(e){return fetch("".concat(_,"/users/me/calendarList?").concat(M({access_token:e})),{method:"GET",async:!0}).then(function(e){return e.json()}).then(function(e){return e.items})}function U(e){return fetch("".concat(_,"/colors?").concat(M({access_token:e})),{method:"GET",async:!0}).then(function(e){return e.json()})}var L=function(){function e(t,a){Object(s.a)(this,e),this.calId=t,this.name=a,this.token=z(),this.syncToken="",this.cache={}}return Object(u.a)(e,[{key:"getSlot",value:function(e){return this.cache[e]||(this.cache[e]={}),this.cache[e]}},{key:"addEvent",value:function(t){var a=e.dateToCacheKey(t.start),n=e.dateToCacheKey(new Date(t.end.getTime()-1));if(a===n)this.getSlot(a)[t.id]={start:t.start,end:t.end,id:t.id};else{this.getSlot(a)[t.id]={start:t.start,end:e.slotEndDate(a),id:t.id},this.getSlot(n)[t.id]={start:e.slotStartDate(n),end:t.end,id:t.id};for(var r=a+1;r<n;r++)this.getSlot(r)[t.id]={start:e.slotStartDate(r),end:e.slotEndDate(r),id:t.id}}}},{key:"removeEvent",value:function(t){for(var a=e.dateToCacheKey(t.start),n=e.dateToCacheKey(new Date(t.end.getTime()-1)),r=a;r<=n;r++)delete this.getSlot(r)[t.id]}},{key:"getSlotEvents",value:function(e,t,a){var n=this.getSlot(e),r=[];for(var c in n){if(!(n[c].start>=a||n[c].end<=t))(n[c].start<t?t:n[c].start)>(n[c].end>a?a:n[c].end)&&console.log(n[c],t,a),r.push({id:c,start:n[c].start<t?t:n[c].start,end:n[c].end>a?a:n[c].end})}return r}},{key:"getCachedEvents",value:function(t,a){for(var n=e.dateToCacheKey(t),r=e.dateToCacheKey(new Date(a.getTime()-1)),c=this.getSlotEvents(n,t,a),o=n+1;o<r;o++){var i=this.getSlot(o);for(var s in i)c.push(i[s])}return r>n&&c.push.apply(c,Object(l.a)(this.getSlotEvents(r,t,a))),c}},{key:"sync",value:function(){var e=this;return this.token.then(function(t){return function(e,t,a){var n=arguments.length>3&&void 0!==arguments[3]?arguments[3]:"",r=[];return function a(c,o){return fetch("".concat(_,"/calendars/").concat(e,"/events?").concat(M({access_token:t,pageToken:c,syncToken:o,maxResults:n})),{method:"GET",async:!0}).then(function(e){if(200===e.status)return e.json();throw{}}).catch(function(e){return e}).then(function(e){return e.items?(r.push.apply(r,Object(l.a)(e.items)),e.nextPageToken?a(e.nextPageToken,""):{nextSyncToken:e.nextSyncToken,results:r}):{nextSyncToken:"",results:[]}})}("",a)}(e.calId,t,e.syncToken).then(function(a){e.syncToken=a.nextSyncToken;var n=a.results.map(function(a){return a.start?Promise.resolve(a):function(e,t,a){return fetch("".concat(_,"/calendars/").concat(e,"/events/").concat(t,"?").concat(M({access_token:a})),{method:"GET",async:!0}).then(function(e){return e.json()})}(e.calId,a.id,t)});return Promise.all(n).then(function(t){return t.forEach(function(t){t.start=new Date(t.start.dateTime),t.end=new Date(t.end.dateTime),"confirmed"===t.status?e.addEvent(t):"cancelled"===t.status&&e.removeEvent(t)})})})})}},{key:"getEvents",value:function(e,t){var a=this;return this.sync().then(function(){return a.getCachedEvents(e,t)})}}],[{key:"dateToCacheKey",value:function(e){return Math.floor(e/864e5)}},{key:"slotStartDate",value:function(e){return new Date(864e5*e)}},{key:"slotEndDate",value:function(e){return new Date(864e5*(e+1))}}]),e}(),$=function(){function e(t,a,n,r){Object(s.a)(this,e),this.id=t,this.isRegex=a,this.value=n,this.label=r}return Object(u.a)(e,[{key:"regex",get:function(){return new RegExp(this.isRegex?this.value:"^".concat(this.value,"$"))}},{key:"isEmpty",get:function(){return null===this.label}}]),e}();$.emptyPattern=function(){return new $(0,!0,"",null)},$.anyPattern=function(){return new $("any",!0,".*","Any")};var H=function e(t,a,n,r){Object(s.a)(this,e),this.name=t,this.idx=a,this.cal=n,this.event=r};H.defaultPatternEntry=function(e){return new H("",e,$.emptyPattern(),$.anyPattern())};var J=a(299),V=a.n(J),q=a(659),X=a(657),Y=a(656),Q=a(554);function Z(e){var t=e.cx,a=e.cy,n=e.x,c=e.y,o=e.fill,i=e.name,l="middle",s=0,u=0;return n<t-2?(s=-5,l="end"):n>t+2&&(s=5,l="start"),c<a-2?u=-5:c>a+2&&(u=10),r.a.createElement("text",{x:n,y:c,dx:s,dy:u,fill:o,textAnchor:l},"".concat(i))}var ee=Object(f.withStyles)(function(e){return{pieChart:{margin:"0 auto"}}})(function(e){return r.a.createElement(B.a,{container:!0,spacing:0},r.a.createElement(B.a,{item:!0,xs:12,lg:6},r.a.createElement("div",{className:e.classes.patternTableWrapper},r.a.createElement(q.a,{width:400,height:250,className:e.classes.pieChart},r.a.createElement(X.a,{data:e.patternGraphData,dataKey:"value",cx:200,cy:125,outerRadius:60,fill:V.a[300],label:Z}),r.a.createElement(Y.a,{formatter:function(e){return"".concat(e.toFixed(2)," hr")}})))),r.a.createElement(B.a,{item:!0,xs:12,lg:6},r.a.createElement("div",{className:e.classes.patternTableWrapper},r.a.createElement(q.a,{width:400,height:250,className:e.classes.pieChart},r.a.createElement(X.a,{data:e.calendarGraphData,dataKey:"value",cx:200,cy:125,innerRadius:40,outerRadius:70,fill:g.a[300],label:Z},e.calendarGraphData.map(function(e,t){return r.a.createElement(Q.a,{key:t,fill:e.color})})),r.a.createElement(Y.a,{formatter:function(e){return"".concat(e.toFixed(2)," hr")}})))))}),te=a(136),ae=a.n(te),ne=a(301),re=a.n(ne),ce=a(303),oe=a.n(ce),ie=a(140),le=a.n(ie),se=a(100),ue=a.n(se),he=a(302),me=a.n(he),de=a(304),pe=a.n(de),fe=a(300),ve=a.n(fe),ge=a(131),Ee=a.n(ge),ye=a(172),we=a.n(ye),be=function(e){function t(){return Object(s.a)(this,t),Object(h.a)(this,Object(m.a)(t).apply(this,arguments))}return Object(d.a)(t,e),Object(u.a)(t,[{key:"render",value:function(){var e=this,t=this.props.classes,a=[],n=this.props.options,c=new $.emptyPattern;for(var o in n[c.id]=c,n){var i=n[o].isEmpty?r.a.createElement("span",{style:{color:this.props.theme.palette.primary.dark}},"Custom"):n[o].label;a.push(r.a.createElement(we.a,{key:o,value:o},i))}var l=this.props.value.isRegex?t.fieldRegex:t.fieldNoRegex;return r.a.createElement(O.a,null,r.a.createElement("span",null,r.a.createElement(Ee.a,{value:this.props.value.id,onChange:function(t){var a;a=null==n[t.target.value].label?new $(0,!0,e.props.value.isRegex?e.props.value.value:"^".concat(e.props.value.value,"$"),null):n[t.target.value],e.props.onChange({target:{value:a}})},className:l},a),null==this.props.value.label&&r.a.createElement(ae.a,{value:this.props.value.value,onChange:function(t){return e.props.onChange({target:{value:new $(0,!0,t.target.value,null)}})}})))}}]),t}(r.a.Component),Pe=Object(f.withStyles)(function(e){return{fieldNoRegex:{width:200},fieldRegex:{marginRight:"0.5em"}}})(be);var xe=a(139),ke=a.n(xe),Se=Object(f.createMuiTheme)({palette:{primary:{light:ke.a[300],main:ke.a[500],dark:ke.a[700],contrastText:"#fff"}},typography:{useNextVariants:!0}}),Ce=[{label:"Name",field:"name",elem:ae.a},{label:"Calendar",field:"cal",elem:Object(f.withTheme)(Se)(function(e){var t={};for(var a in e.cached.calendars)t[a]=new $(a,!1,e.cached.calendars[a].name,e.cached.calendars[a].name);return r.a.createElement(Pe,{value:e.value,options:t,onChange:e.onChange,theme:e.theme})})},{label:"Event",field:"event",elem:Object(f.withTheme)(Se)(function(e){var t=$.anyPattern(),a={};return a[t.id]=t,r.a.createElement(Pe,{value:e.value,options:a,onChange:e.onChange,theme:e.theme})})}],De=function(e){function t(){var e,a;Object(s.a)(this,t);for(var n=arguments.length,r=new Array(n),c=0;c<n;c++)r[c]=arguments[c];return(a=Object(h.a)(this,(e=Object(m.a)(t)).call.apply(e,[this].concat(r)))).state={page:0,rowsPerPage:5},a.handleChangePage=function(e,t){a.setState({page:t})},a.handleChangeRowsPerPage=function(e){a.setState({rowsPerPage:e.target.value})},a}return Object(d.a)(t,e),Object(u.a)(t,[{key:"render",value:function(){var e=this,t=this.props,a=t.classes,n=t.cached,c=t.patterns,o=this.state,i=o.rowsPerPage,l=o.page,s=i-Math.min(i,c.length-l*i),u=c.slice(l*i,(l+1)*i).map(function(t){return r.a.createElement(le.a,{onMouseOver:function(){return e.setState({activePattern:t.idx})},onMouseOut:function(){return e.setState({activePattern:null})}},Ce.map(function(a){var c=a.elem;return r.a.createElement(ue.a,null,r.a.createElement(c,{value:t[a.field],cached:n,onChange:function(n){return e.props.onUpdatePattern(a.field,t.idx,n.target.value)}}))}),r.a.createElement("span",{className:e.state.activePattern===t.idx?a.deleteButtonShow:a.deleteButtonHide},r.a.createElement(ve.a,{className:a.deleteIcon,onClick:function(){return e.props.onRemovePattern(t.idx)}})))});return r.a.createElement("div",null,r.a.createElement("div",{className:a.patternTableWrapper},r.a.createElement(re.a,{className:a.patternTable},r.a.createElement(me.a,null,r.a.createElement(le.a,null,Ce.map(function(e,t){return r.a.createElement(ue.a,{key:t},e.label)}))),r.a.createElement(oe.a,null,u,s>0&&r.a.createElement(le.a,{style:{height:48*s}},r.a.createElement(ue.a,{colSpan:Ce.length}))))),r.a.createElement(pe.a,{rowsPerPageOptions:[5,10,25],component:"div",count:c.length,rowsPerPage:i,page:l,backIconButtonProps:{"aria-label":"Previous Page"},nextIconButtonProps:{"aria-label":"Next Page"},onChangePage:this.handleChangePage,onChangeRowsPerPage:this.handleChangeRowsPerPage}))}}]),t}(r.a.Component),Te=Object(f.withStyles)(function(e){return{deleteButtonShow:{position:"absolute",right:0,height:48},deleteButtonHide:{display:"none"},deleteIcon:{height:"100%",cursor:"pointer"},patternTableWrapper:{overflowX:"auto",overflowY:"hidden"},patternTable:{minWidth:600}}})(De),Oe=[{name:"Work",value:10,color:g.a[300]},{name:"Wasted",value:10,color:g.a[300]}];var je=function(e){function t(){var e,a;Object(s.a)(this,t);for(var n=arguments.length,r=new Array(n),c=0;c<n;c++)r[c]=arguments[c];return(a=Object(h.a)(this,(e=Object(m.a)(t)).call.apply(e,[this].concat(r)))).state={patterns:[],timeRange:null,token:z(),patternGraphData:Oe,calendarGraphData:Oe,activePattern:null},a.cached={calendars:{}},a.updatePattern=function(e,t,n){var r=a.state.patterns;r[t][e]=n,a.setState({patterns:r})},a.removePattern=function(e){var t=a.state.patterns;t.splice(e,1);for(var n=0;n<t.length;n++)t[n].idx=n;a.setState({patterns:t})},a.newPattern=function(){for(var e=[H.defaultPatternEntry()].concat(Object(l.a)(a.state.patterns)),t=1;t<e.length;t++)e[t].idx=t;a.setState({patterns:e})},a.analyze=function(){if(a.state.startDate&&a.state.endDate){var e=a.state.startDate.toDate(),t=a.state.endDate.toDate();console.log(e,t);var n=[],r=function(r){n.push(a.cached.calendars[r].cal.getEvents(e,t).then(function(e){return{id:r,events:e}}))};for(var c in a.cached.calendars)r(c);Promise.all(n).then(function(e){var t={},n={},r={};e.forEach(function(e){return t[e.id]=e.events});for(var c=0;c<a.state.patterns.length;c++)n[c]=0;var o=function(e){if(!t[e])return"continue";var c=function(e,t){return e.filter(function(e){return e.cal.regex.test(t)})}(a.state.patterns,a.cached.calendars[e].name);t[e].forEach(function(t){c.forEach(function(a){if(a.event.regex.test(t.summary)){r.hasOwnProperty(e)||(r[e]=0);var c=(t.end-t.start)/6e4;n[a.idx]+=c,r[e]+=c}})})};for(var i in a.cached.calendars)o(i);for(var l=[],s=[],u=0;u<a.state.patterns.length;u++)l.push({name:a.state.patterns[u].name,value:n[u]/60});for(var i in r)s.push({name:a.cached.calendars[i].name,value:r[i]/60,color:a.cached.calendars[i].color.background});a.setState({patternGraphData:l,calendarGraphData:s})})}else alert("Please choose a valid time range.")},a.loadPatterns=function(){var e=a.state.token,t=e.then(U).then(function(e){return e.calendar}),n=e.then(F);Promise.all([t,n]).then(function(e){var t=Object(i.a)(e,2),n=t[0],r=t[1];r.forEach(function(e){a.cached.calendars[e.id]={name:e.summary,color:n[e.colorId],cal:new L(e.id,e.summary)}}),a.setState({patterns:r.map(function(e,t){return new H(e.summary,t,new $(e.id,!1,e.summary,e.summary),$.anyPattern())})})})},a}return Object(d.a)(t,e),Object(u.a)(t,[{key:"render",value:function(){var e=this,t=this.props.classes;return r.a.createElement(f.MuiThemeProvider,{theme:Se},r.a.createElement("div",{className:t.root},r.a.createElement(b.a,{position:"absolute",className:t.appBar},r.a.createElement(x.a,{className:t.toolbar},r.a.createElement(S.a,{component:"h1",variant:"h6",color:"inherit",noWrap:!0,className:t.title},r.a.createElement(A,{style:{width:"2em",verticalAlign:"bottom",marginRight:"0.2em"}}),"Chromicle"))),r.a.createElement("main",{className:t.content},r.a.createElement("div",{className:t.appBarSpacer}),r.a.createElement(B.a,{container:!0,spacing:16},r.a.createElement(y.a,null),r.a.createElement(B.a,{item:!0,md:6,xs:12},r.a.createElement(O.a,{fullWidth:!0},r.a.createElement(R.a,null,r.a.createElement(S.a,{variant:"h6",component:"h1",gutterBottom:!0},"Event Patterns",r.a.createElement(K.a,{style:{marginBottom:"0.12em",marginLeft:"0.5em"},onClick:function(){return e.newPattern()}},r.a.createElement(I.a,null))),r.a.createElement(Te,{patterns:this.state.patterns,cached:this.cached,onRemovePattern:this.removePattern,onUpdatePattern:this.updatePattern})),r.a.createElement(R.a,null,r.a.createElement(S.a,{variant:"h6",component:"h1",gutterBottom:!0},"Time Range"),r.a.createElement("div",{style:{textAlign:"center"}},r.a.createElement(p.DateRangePicker,{startDate:this.state.startDate,startDateId:"start_date_id",endDate:this.state.endDate,endDateId:"end_date_id",onDatesChange:function(t){var a=t.startDate,n=t.endDate;e.setState({startDate:a,endDate:n})},focusedInput:this.state.focusedInput,onFocusChange:function(t){return e.setState({focusedInput:t})},isOutsideRange:function(){return!1}}))),r.a.createElement("div",{className:t.buttonSpacer}),r.a.createElement(B.a,{container:!0,spacing:16},r.a.createElement(B.a,{item:!0,md:6,xs:12},r.a.createElement(R.a,null,r.a.createElement(D.a,{variant:"contained",color:"primary",onClick:this.loadPatterns},"Load"))),r.a.createElement(B.a,{item:!0,md:6,xs:12},r.a.createElement(R.a,null,r.a.createElement(D.a,{variant:"contained",color:"primary",onClick:this.analyze},"Analyze")))))),r.a.createElement(B.a,{item:!0,md:6,xs:12},r.a.createElement(S.a,{variant:"h6",component:"h1",gutterBottom:!0},"Graph"),r.a.createElement(ee,{patternGraphData:this.state.patternGraphData,calendarGraphData:this.state.calendarGraphData}))))))}}]),t}(r.a.Component),Re=Object(f.withStyles)(function(e){return{root:{display:"flex",height:"100vh"},appBar:{zIndex:e.zIndex.drawer+1,transition:e.transitions.create(["width","margin"],{easing:e.transitions.easing.sharp,duration:e.transitions.duration.leavingScreen})},title:{flexGrow:1},sectionTitle:{flex:"0 0 auto"},appBarSpacer:e.mixins.toolbar,content:{flexGrow:1,padding:3*e.spacing.unit,overflow:"auto"},buttonSpacer:{marginBottom:4*e.spacing.unit},fab:{margin:e.spacing.unit}}})(je);Boolean("localhost"===window.location.hostname||"[::1]"===window.location.hostname||window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/));o.a.render(r.a.createElement(Re,null),document.getElementById("root")),"serviceWorker"in navigator&&navigator.serviceWorker.ready.then(function(e){e.unregister()})}},[[308,2,1]]]);
//# sourceMappingURL=main.47fd8d39.chunk.js.map