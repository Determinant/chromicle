import React from 'react';
import { withStyles } from '@material-ui/core/styles';
const styles = {
    st0: {fill: '#F9CC8A'},
    st2: {fill: '#C0E5E0'},
    st3: {fill: '#FFFFFF'},
    st4: {fill: '#8B5E3C'},
    st5: {fill: '#FBD015'},
    st6: {fill: '#F69D98'},
};

function Donut(props: {
    style: {[key: string]: string | number },
    classes: {
        st0: string,
        st2: string,
        st3: string,
        st4: string,
        st5: string,
        st6: string,
    }}) {
    let {st0, st2, st3, st4, st5, st6 } = props.classes;
    return (
  <svg
     xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 236.60422 236.60779"
     version="1.1"
     style={props.style}>
    <g
       id="g4331"
       transform="translate(-579.29969,-41.696103)"><g
         id="g4329"><path
           id="path128"
           d="M 813.8,137.9 C 801.6,73.7 739.7,31.6 675.5,43.8 611.4,56 569.2,118 581.4,182.1 593.6,246.3 655.5,288.4 719.7,276.2 783.9,264 826,202.1 813.8,137.9 Z m -106.1,66.9 c -24,4.6 -47.2,-11.2 -51.8,-35.2 -4.6,-24 11.2,-47.2 35.2,-51.8 24,-4.6 47.2,11.2 51.8,35.2 4.6,24 -11.1,47.2 -35.2,51.8 z"
           className={st0}
           style={{fill:"#f9cc8a"}} /><path
           id="path130"
           d="M 805.7,147.2 C 804.1,133.9 791.5,130.6 784.2,120 776.9,109.4 798.7,89.5 774.1,83.6 749.5,77.7 752.3,82 743.3,77.2 c -9,-4.8 -2.2,-21.2 -12.9,-25.1 -10.7,-3.9 -19.5,7.3 -27.2,8.5 -7.7,1.2 -21.5,-11.3 -30.4,-8.4 -8.9,2.8 -8,15 -15.1,19.1 -7.1,4.2 -21.9,-0.8 -32.4,7.4 -10.5,8.2 -0.9,17.2 -6.4,26.8 -5.5,9.6 -19.9,-1 -24.1,13 -4.2,14.1 5.4,25.8 4.5,34.1 -0.9,8.3 -13.1,20.5 -9.1,35.6 4,15.2 14.7,9.1 20.9,16.3 6.2,7.2 -2.4,17.6 2.8,27.6 5.2,10 22.9,6.7 28.9,10.8 5.9,4.1 16.8,24.3 26.2,25.5 9.4,1.2 11.4,-8.1 21.2,-9.1 9.8,-1 14.9,11.7 31.6,7.3 16.7,-4.4 12.6,-16.3 20.4,-20.9 7.8,-4.6 15.1,4.4 25,-3.8 9.9,-8.2 2,-13.9 7.9,-22.4 6,-8.5 20.9,-8.1 25.3,-20.1 4.5,-12 -10,-16.7 -8.8,-29.1 1.3,-12.3 15.7,-9.8 14.1,-23.1 z M 708,204.7 c -24,4.6 -47.2,-11.2 -51.8,-35.2 -4.6,-24 11.2,-47.2 35.2,-51.8 24,-4.6 47.2,11.2 51.8,35.2 4.6,24 -11.2,47.2 -35.2,51.8 z"
           className={st4}
           style={{fill:"#8b5e3c"}} /><path
           id="path132"
           d="m 776.1,124.9 c -4.1,3.4 -8.2,6.7 -12.4,10.1 -3,2.5 1,7.1 4,4.6 4.1,-3.4 8.2,-6.7 12.4,-10.1 3,-2.5 -0.9,-7.1 -4,-4.6 z"
           className={st2}
           style={{fill:"#c0e5e0"}} /><path
           id="path134"
           d="m 706.6,230.8 c -2.2,-4.9 -4.3,-9.7 -6.5,-14.6 -1.6,-3.6 -7.1,-0.9 -5.5,2.6 2.2,4.9 4.3,9.7 6.5,14.6 1.7,3.6 7.1,1 5.5,-2.6 z"
           className={st2}
           style={{fill:"#c0e5e0"}} /><path
           id="path136"
           d="m 750.1,122.4 c -4.7,-2.4 -9.5,-4.8 -14.2,-7.2 -3.5,-1.8 -6.1,3.7 -2.6,5.5 4.7,2.4 9.5,4.8 14.2,7.2 3.5,1.7 6,-3.8 2.6,-5.5 z"
           className={st2}
           style={{fill:"#c0e5e0"}} /><path
           id="path138"
           d="m 676.7,74.8 c -4.9,2.1 -9.7,4.3 -14.6,6.4 -3.6,1.6 -1,7.1 2.6,5.5 4.9,-2.1 9.7,-4.3 14.6,-6.4 3.6,-1.6 0.9,-7 -2.6,-5.5 z"
           className={st2}
           style={{fill:"#c0e5e0"}} /><path
           id="path140"
           d="m 632.7,121.1 c -4.1,3.4 -8.2,6.7 -12.4,10.1 -3,2.5 1,7.1 4,4.6 4.1,-3.4 8.2,-6.7 12.4,-10.1 3,-2.5 -1,-7 -4,-4.6 z"
           className={st2}
           style={{fill:"#c0e5e0"}} /><path
           id="path142"
           d="m 628.2,195.7 c 0.9,5.2 1.7,10.5 2.6,15.7 0.6,3.9 6.6,2.7 6,-1.2 -0.9,-5.2 -1.7,-10.5 -2.6,-15.7 -0.7,-3.8 -6.7,-2.6 -6,1.2 z"
           className={st2}
           style={{fill:"#c0e5e0"}} /><path
           id="path144"
           d="m 767.5,98.1 c -1.8,5 -3.6,10 -5.5,15 -1.3,3.7 4.4,5.6 5.8,1.9 1.8,-5 3.6,-10 5.5,-15 1.4,-3.6 -4.4,-5.5 -5.8,-1.9 z"
           className={st3}
           style={{fill:"#ffffff"}} /><path
           id="path146"
           d="m 667.2,210.2 c 1.2,5.2 2.5,10.3 3.7,15.5 0.9,3.8 6.8,2.2 5.9,-1.6 -1.2,-5.2 -2.5,-10.3 -3.7,-15.5 -0.9,-3.8 -6.8,-2.2 -5.9,1.6 z"
           className={st3}
           style={{fill:"#ffffff"}} /><path
           id="path148"
           d="m 703.6,91.7 c 1.5,5.1 3.1,10.2 4.6,15.3 1.1,3.7 6.9,1.8 5.8,-1.9 -1.5,-5.1 -3.1,-10.2 -4.6,-15.3 -1.2,-3.8 -6.9,-1.9 -5.8,1.9 z"
           className={st3}
           style={{fill:"#ffffff"}} /><path
           id="path150"
           d="m 621.9,170.5 c -5,1.9 -9.9,3.9 -14.9,5.8 -3.6,1.4 -1.2,7 2.4,5.6 5,-1.9 9.9,-3.9 14.9,-5.8 3.7,-1.4 1.3,-7 -2.4,-5.6 z"
           className={st3}
           style={{fill:"#ffffff"}} /><path
           id="path152"
           d="m 791,192.1 c -5,-1.8 -10,-3.6 -15,-5.4 -3.7,-1.3 -5.5,4.5 -1.9,5.8 5,1.8 10,3.6 15,5.4 3.7,1.3 5.5,-4.5 1.9,-5.8 z"
           className={st3}
           style={{fill:"#ffffff"}} /><path
           id="path154"
           d="m 733.4,233.3 c -4.8,2.4 -9.5,4.8 -14.3,7.2 -3.5,1.8 -0.6,7.1 2.9,5.3 4.8,-2.4 9.5,-4.8 14.3,-7.2 3.5,-1.8 0.6,-7.1 -2.9,-5.3 z"
           className={st3}
           style={{fill:"#ffffff"}} /><path
           id="path156"
           d="m 751.6,160.2 c 3.2,4.3 6.3,8.6 9.5,12.8 2.3,3.1 7.1,-0.6 4.8,-3.8 -3.2,-4.3 -6.3,-8.6 -9.5,-12.8 -2.4,-3.1 -7.2,0.6 -4.8,3.8 z"
           className={st6}
           style={{fill:"#f69d98"}} /><path
           id="path158"
           d="m 633.6,146.6 c 3.1,4.3 6.3,8.6 9.4,12.9 2.3,3.2 7.1,-0.6 4.8,-3.7 -3.1,-4.3 -6.3,-8.6 -9.4,-12.9 -2.3,-3.2 -7.1,0.5 -4.8,3.7 z"
           className={st6}
           style={{fill:"#f69d98"}} /><path
           id="path160"
           d="m 720.6,68.7 c -0.8,5.3 -1.7,10.5 -2.5,15.8 -0.6,3.9 5.4,4.6 6,0.8 0.8,-5.3 1.7,-10.5 2.5,-15.8 0.6,-3.9 -5.4,-4.7 -6,-0.8 z"
           className={st6}
           style={{fill:"#f69d98"}} /><path
           id="path162"
           d="m 661,103.6 c 4.2,3.3 8.3,6.6 12.5,9.9 3.1,2.4 6.7,-2.4 3.6,-4.9 -4.2,-3.3 -8.3,-6.6 -12.5,-9.9 -3,-2.4 -6.6,2.5 -3.6,4.9 z"
           className={st6}
           style={{fill:"#f69d98"}} /><path
           id="path164"
           d="m 647.1,213.9 c -2.8,4.5 -5.5,9.1 -8.3,13.6 -2,3.3 3.2,6.3 5.3,3 2.8,-4.5 5.5,-9.1 8.3,-13.6 2.1,-3.4 -3.2,-6.4 -5.3,-3 z"
           className={st6}
           style={{fill:"#f69d98"}} /><path
           id="path166"
           d="m 770.6,158.6 c 3.7,3.8 7.4,7.7 11.1,11.5 2.7,2.8 7,-1.5 4.2,-4.3 -3.7,-3.8 -7.4,-7.7 -11.1,-11.5 -2.7,-2.9 -6.9,1.5 -4.2,4.3 z"
           className={st5}
           style={{fill:"#fbd015"}} /><path
           id="path168"
           d="m 641.9,183 c 2.2,4.8 4.4,9.7 6.6,14.5 1.6,3.6 7.1,0.9 5.5,-2.7 -2.2,-4.8 -4.4,-9.7 -6.6,-14.5 -1.7,-3.5 -7.1,-0.8 -5.5,2.7 z"
           className={st5}
           style={{fill:"#fbd015"}} /><path
           id="path170"
           d="m 663.9,237.9 c 0,5.3 0.1,10.6 0.1,16 0,3.9 6.1,3.7 6.1,-0.2 0,-5.3 -0.1,-10.6 -0.1,-16 -0.1,-3.9 -6.2,-3.7 -6.1,0.2 z"
           className={st5}
           style={{fill:"#fbd015"}} /><path
           id="path172"
           d="m 635.4,94.6 c 2.2,4.8 4.4,9.7 6.6,14.5 1.6,3.6 7.1,0.9 5.5,-2.7 -2.2,-4.8 -4.4,-9.7 -6.6,-14.5 -1.7,-3.6 -7.1,-0.9 -5.5,2.7 z"
           className={st5}
           style={{fill:"#fbd015"}} /><path
           id="path174"
           d="m 655.9,120.2 c -4.2,3.2 -8.5,6.4 -12.7,9.6 -3.1,2.4 0.7,7.1 3.8,4.7 4.2,-3.2 8.5,-6.4 12.7,-9.6 3.2,-2.4 -0.6,-7.1 -3.8,-4.7 z"
           className={st3}
           style={{fill:"#ffffff"}} /><path
           id="path176"
           d="m 733.9,99.4 c 5,1.9 9.9,3.8 14.9,5.7 3.6,1.4 5.7,-4.3 2,-5.7 -5,-1.9 -9.9,-3.8 -14.9,-5.7 -3.7,-1.5 -5.7,4.3 -2,5.7 z"
           className={st5}
           style={{fill:"#fbd015"}} /><path
           id="path178"
           d="m 691.7,68.3 c -1.6,5.1 -3.2,10.2 -4.8,15.2 -1.2,3.7 4.7,5.4 5.9,1.6 1.6,-5.1 3.2,-10.2 4.8,-15.2 1.1,-3.7 -4.7,-5.4 -5.9,-1.6 z"
           className={st5}
           style={{fill:"#fbd015"}} /><path
           id="path180"
           d="m 606.7,142.7 c 1.8,5 3.6,10 5.3,15 1.3,3.7 7,1.5 5.7,-2.2 -1.8,-5 -3.6,-10 -5.3,-15 -1.4,-3.7 -7,-1.5 -5.7,2.2 z"
           className={st5}
           style={{fill:"#fbd015"}} /><path
           id="path182"
           d="m 684.7,240.7 c 3.6,3.9 7.3,7.8 10.9,11.7 2.7,2.9 7,-1.4 4.3,-4.3 -3.6,-3.9 -7.3,-7.8 -10.9,-11.7 -2.7,-2.9 -7,1.4 -4.3,4.3 z"
           className={st6}
           style={{fill:"#f69d98"}} /><path
           id="path184"
           d="m 758.5,221.1 c -4.1,3.4 -8.2,6.8 -12.2,10.2 -3,2.5 1,7 4,4.5 4.1,-3.4 8.2,-6.8 12.2,-10.2 3,-2.5 -1,-7 -4,-4.5 z"
           className={st5}
           style={{fill:"#fbd015"}} /><path
           id="path186"
           d="m 732.7,215.1 c -5.3,-0.4 -10.6,-0.8 -15.9,-1.1 -3.9,-0.3 -4.1,5.8 -0.2,6.1 5.3,0.4 10.6,0.8 15.9,1.1 3.8,0.3 4.1,-5.8 0.2,-6.1 z"
           className={st6}
           style={{fill:"#f69d98"}} /><path
           id="path188"
           d="m 748.8,190.7 c -1.9,5 -3.8,10 -5.6,14.9 -1.4,3.7 4.4,5.6 5.7,2 1.9,-5 3.8,-10 5.6,-14.9 1.4,-3.7 -4.4,-5.7 -5.7,-2 z"
           className={st2}
           style={{fill:"#c0e5e0"}} /></g></g>
  </svg>);
}

export default withStyles(styles)(Donut);
