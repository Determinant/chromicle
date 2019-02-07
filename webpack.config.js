const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: {
        index: "./src/index.js",
        background: "./src/background.js",
        popup: "./src/popup.js"
    },
    output: {
        path: path.join(__dirname, "/dist"),
        filename: "[name].js"
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader"
                },
            },
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"]
            },
            { test: /\.(png|woff|woff2|eot|ttf|svg)$/, loader: 'url-loader?limit=100000' }
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
        new CopyWebpackPlugin([
            {from:'./public/', to:'./'}
        ]),
    ],
};
