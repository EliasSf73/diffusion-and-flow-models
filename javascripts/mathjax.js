window.MathJax = {
  tex: {
    inlineMath: [["\\(", "\\)"]],
    displayMath: [["\\[", "\\]"]],
    processEscapes: true,
    processEnvironments: true,
    tags: "ams",
    macros: {
      R: "\\mathbb{R}",
      E: "\\mathbb{E}",
      N: "\\mathcal{N}",
      KL: "\\mathrm{KL}",
      d: "\\mathrm{d}",
      score: "\\nabla_{x}\\log p",
      abs: ["\\left|#1\\right|", 1],
      norm: ["\\left\\|#1\\right\\|", 1]
    }
  },
  options: {
    ignoreHtmlClass: ".*|",
    processHtmlClass: "arithmatex"
  }
};

document$.subscribe(() => {
  MathJax.startup.output.clearCache();
  MathJax.typesetClear();
  MathJax.texReset();
  MathJax.typesetPromise();
});
