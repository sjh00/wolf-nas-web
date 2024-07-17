import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  clean: true,
  declaration: true,
  entries: [
    {
      builder: 'mkdist',
      format: 'esm',
      input: './src',
      loaders: ['js'],
      pattern: ['**/*.ts', '**/*.svg'],
    },
  ],
  externals: ['vue'],
});
