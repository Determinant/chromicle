declare module 'react-material-color-picker' {
    class MaterialColorPicker {
        constructor(props: {
            initColor: string,
            style: {[name: string]: string | number},
            submitLabel: string,
            resetLabel: string,
            onSelect: (event: { target: value }) => void,
            onSubmit: () => void,
            onReset: () => void
        });
    }
    export = LRUCache;
}
