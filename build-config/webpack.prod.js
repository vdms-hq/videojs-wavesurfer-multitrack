const { merge } = require('webpack-merge');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const RemoveEmptyScripts = require('webpack-remove-empty-scripts');

const devConfig = require('./webpack.dev.js');

module.exports = merge(devConfig, {
    mode: 'production',
    devtool: false,
    entry: {
        'videojs.wavesurfer.multitrack': path.resolve(__dirname, '../src/js/index.js'),
        'videojs.wavesurfer.multitrack.min': path.resolve(__dirname, '../src/js/index.js'),
    },
    output: {
        filename: '[name].js',
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                include: /\.min\.js$/,
                terserOptions: {
                    format: {
                        comments: false,
                    },
                },
                extractComments: false,
            }),
            new CssMinimizerPlugin({
                include: /\.min\./,
            }),
        ],
    },
    plugins: [
        new RemoveEmptyScripts(),
        new MiniCssExtractPlugin({
            filename: 'css/[name].css',
        }),
    ],
});
