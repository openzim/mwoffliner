
// // This is just a refactoring stub for now.
// // Eventually, we want a MWOffliner object that might swallow this.
// class OfflinerEnv {
//   public nopic: boolean;
//   public novid: boolean;
//   public nopdf: boolean;
//   public nozim: boolean;
//   public nodet: boolean;
//   public htmlRootPath: string;
//   public contentDate: string;
//   public filenamePrefix: any;
//   public resume: boolean;
//   public keepHtml: any;
//   public writeHtmlRedirects: any;
//   public deflateTmpHtml: any;

//   constructor(envObjs) {
//     Object.assign(this, envObjs);
//     // output config (FIXME: Does this belong in Zim?)
//     this.nopic = false;
//     this.novid = false;
//     this.nopdf = false;
//     this.nozim = false;
//     this.nodet = false;
//     // Script direction (defaults to ltr)
//     this.htmlRootPath = '';
//     // Content date (FIXME: Does this belong in Zim?)
//     const date = new Date();
//     this.contentDate = `${date.getFullYear()}-${(`0${date.getMonth() + 1}`).slice(-2)}`;
//     // Compute dump formats

//   }
// }

// export default OfflinerEnv;
