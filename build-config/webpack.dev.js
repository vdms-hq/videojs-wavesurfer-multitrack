const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const RemoveEmptyScripts = require('webpack-remove-empty-scripts');

module.exports = {
    mode: 'development',
    devtool: 'source-map',
    entry: {
        'videojs.wavesurfer.multitrack': path.resolve(__dirname, '../src/js/index.js'),
    },
    output: {
        path: path.resolve(__dirname, '../dist'),
        filename: '[name].js',
        library: {
            name: 'VideojsWavesurferMultitrack',
            type: 'umd',
            export: 'default',
        },
        globalObject: 'this',
        clean: false,
    },
    externals: {
        'video.js': {
            commonjs: 'video.js',
            commonjs2: 'video.js',
            amd: 'video.js',
            root: 'videojs',
        },
        'wavesurfer.js': {
            commonjs: 'wavesurfer.js',
            commonjs2: 'wavesurfer.js',
            amd: 'wavesurfer.js',
            root: 'WaveSurfer',
        },
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                },
            },
            {
                test: /\.(scss|css)$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
                    'sass-loader',
                ],
            },
        ],
    },
    plugins: [
        new RemoveEmptyScripts(),
        new MiniCssExtractPlugin({
            filename: 'css/[name].css',
        }),
    ],
    devServer: {
        static: {
            directory: path.resolve(__dirname, '../'),
        },
        port: 9000,
        open: '/examples/index.html',
    },
};
