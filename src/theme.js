import { createMuiTheme } from '@material-ui/core/styles';
import orange from '@material-ui/core/colors/orange';

const theme = createMuiTheme({
    palette: {
        primary: {
            light: orange[300],
            main: orange[500],
            dark: orange[700],
            contrastText: "#fff"
        }
    },
    typography: {
        useNextVariants: true,
    }
});

export default theme;
