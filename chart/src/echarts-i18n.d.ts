/** ECharts ships the ESM locale tables without declarations. */
declare module 'echarts/lib/i18n/langPL.js' {
  // A top-level import would turn this file into a module, and `declare module` inside a module
  // means augmentation — which needs the target to already have types. Hence the inline import().
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const locale: Parameters<typeof import('echarts/core').registerLocale>[1];
  export default locale;
}
