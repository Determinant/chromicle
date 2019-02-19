declare module 'materialcolorize' {
    namespace materialcolorize {
        function approximateColor(color: string): string;
        function getColorFamily(color: string): {[key: string]: string};
    }
    export = materialcolorize;
}
