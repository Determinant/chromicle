const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require('copy-webpack-plugin');
module.exports = (env, argv) => {
    const prodMode = argv.mode == 'production';
    return {
        entry: {
            index: "./src/index.tsx",
            background: "./src/background.ts",
            popup: "./src/popup.tsx",
            tab: "./src/tab.tsx"
        },
        output: {
            path: path.join(__dirname, "/dist"),
            filename: "[name].js"
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js", ".json"]
        },
        devtool: "source-map",
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    exclude: /node_modules/,
                    use: ['ts-loader']
                },
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: ["source-map-loader"],
                    enforce: "pre"
                },
                {
                    test: /\.css$/,
                    use: ["style-loader", "css-loader"]
                },
                { test: /\.(png|woff|woff2|eot|ttf|svg)$/, loader: 'url-loader' }
            ]
        },
        plugins: [
            new HtmlWebpackPlugin({
                chunks: ['index'],
                template: "./src/index.html",
                filename: "./index.html"
            }),
            new HtmlWebpackPlugin({
                chunks: ['popup'],
                template: "./src/index.html",
                filename: "./popup.html"
            }),
            new HtmlWebpackPlugin({
                chunks: ['tab'],
                template: "./src/tab.html",
                filename: "./tab.html"
            }),
            new CopyWebpackPlugin({patterns: [
                {from:'./public/', to:'./'},
                {
                    from: prodMode ? './manifest.prod.json' : './manifest.dev.json',
                    to: './manifest.json'
                }
            ]}),
        ],
        //optimization: prodMode ? ({
        //    splitChunks: {
        //        chunks: 'all'
        //    }
        //}) : {}
    };
};
