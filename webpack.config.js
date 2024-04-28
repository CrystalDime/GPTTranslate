const path = require('path');

module.exports = {
        entry: {
                background: './src/background.ts',
                content: './src/content.ts',
                settings: './src/settings.ts',
        },
        output: {
                path: path.resolve(__dirname, 'dist'),
                filename: '[name].js'
        },
        module: {
                rules: [
                        {
                                test: /\.tsx?$/,
                                use: 'ts-loader',
                                exclude: /node_modules/,
                        }
                ]
        },
        resolve: {
                extensions: ['.tsx', '.ts', '.js'],
        },
        devtool: 'cheap-module-source-map',
        mode: 'development'
};
