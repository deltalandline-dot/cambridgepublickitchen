(function () {
  var FRACTIONS = {
    "¼": 0.25, "½": 0.5, "¾": 0.75,
    "⅓": 1 / 3, "⅔": 2 / 3,
    "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
    "⅙": 1 / 6, "⅚": 5 / 6,
    "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875
  };
  var FRACTION_CHARS = Object.keys(FRACTIONS).join("");
  // Tried in order: a numeric range ("4-5", "6–10"; both ends get scaled), a
  // mixed ascii number ("1 1/2"), a bare ascii fraction ("1/2"), a mixed
  // unicode number ("1 ½"), a plain integer/decimal, then a bare unicode
  // fraction ("½ c"). Order matters — shorter patterns would otherwise match
  // a prefix of a longer one and leave a dangling "-5" or "/2" in `rest`.
  var RANGE_RE = /^(\s*~?\s*)(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/;
  var MIXED_ASCII_RE = /^(\s*~?\s*)(\d+)\s+(\d+)\/(\d+)/;
  var ASCII_FRAC_RE = /^(\s*~?\s*)(\d+)\/(\d+)/;
  var MIXED_RE = new RegExp("^(\\s*~?\\s*)(\\d+)\\s+([" + FRACTION_CHARS + "])");
  var INT_RE = /^(\s*~?\s*)(\d+(?:\.\d+)?)/;
  var FRAC_RE = new RegExp("^(\\s*~?\\s*)([" + FRACTION_CHARS + "])");
  var DISPLAY = [
    [0, ""], [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.375, "⅜"], [0.5, "½"],
    [0.625, "⅝"], [2 / 3, "⅔"], [0.75, "¾"], [0.875, "⅞"]
  ];

  function parseQty(text) {
    var m;
    if ((m = text.match(RANGE_RE))) {
      return {
        type: "range", approx: m[1].indexOf("~") !== -1,
        value1: parseFloat(m[2]), value2: parseFloat(m[3]),
        rest: text.slice(m[0].length)
      };
    }
    if ((m = text.match(MIXED_ASCII_RE))) {
      return {
        type: "single", approx: m[1].indexOf("~") !== -1,
        value: parseFloat(m[2]) + parseFloat(m[3]) / parseFloat(m[4]),
        rest: text.slice(m[0].length)
      };
    }
    if ((m = text.match(ASCII_FRAC_RE))) {
      return {
        type: "single", approx: m[1].indexOf("~") !== -1,
        value: parseFloat(m[2]) / parseFloat(m[3]),
        rest: text.slice(m[0].length)
      };
    }
    if ((m = text.match(MIXED_RE))) {
      return {
        type: "single", approx: m[1].indexOf("~") !== -1,
        value: parseFloat(m[2]) + FRACTIONS[m[3]],
        rest: text.slice(m[0].length)
      };
    }
    if ((m = text.match(INT_RE))) {
      return {
        type: "single", approx: m[1].indexOf("~") !== -1,
        value: parseFloat(m[2]),
        rest: text.slice(m[0].length)
      };
    }
    if ((m = text.match(FRAC_RE))) {
      return {
        type: "single", approx: m[1].indexOf("~") !== -1,
        value: FRACTIONS[m[2]],
        rest: text.slice(m[0].length)
      };
    }
    return null;
  }

  function formatQty(value) {
    var whole = Math.floor(value + 1e-9);
    var frac = value - whole;
    var best = DISPLAY[0], bestDiff = 1;
    DISPLAY.forEach(function (pair) {
      var diff = Math.abs(frac - pair[0]);
      if (diff < bestDiff) { bestDiff = diff; best = pair; }
    });
    if (bestDiff < 0.03) {
      if (best[0] === 0) return String(whole);
      return (whole ? whole + " " : "") + best[1];
    }
    return String(Math.round(value * 100) / 100);
  }

  function formatParsed(parsed, multiplier) {
    var tilde = parsed.approx ? "~" : "";
    if (parsed.type === "range") {
      return tilde + formatQty(parsed.value1 * multiplier) + "-" +
        formatQty(parsed.value2 * multiplier) + parsed.rest;
    }
    return tilde + formatQty(parsed.value * multiplier) + parsed.rest;
  }

  function firstMeaningfulTextNode(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var node = el.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return node;
    }
    return null;
  }

  function findIngredientNodes() {
    var out = [];
    var paragraphs = document.querySelectorAll("p");
    for (var i = 0; i < paragraphs.length; i++) {
      if (!/^ingredient/i.test(paragraphs[i].textContent.trim())) continue;
      var list = paragraphs[i].nextElementSibling;
      if (!list || list.tagName !== "UL") continue;
      var items = list.querySelectorAll("li");
      for (var j = 0; j < items.length; j++) {
        var label = items[j].querySelector("label");
        if (!label) continue;
        var textNode = firstMeaningfulTextNode(label);
        if (!textNode || textNode.textContent.indexOf("·") !== -1) continue;
        var qty = parseQty(textNode.textContent);
        if (qty) out.push({ node: textNode, original: textNode.textContent, parsed: qty, gap: " " });
      }
    }
    return out;
  }

  function findYieldNode() {
    var paragraphs = document.querySelectorAll("p");
    for (var i = 0; i < paragraphs.length; i++) {
      var m = paragraphs[i].textContent.match(/^(\s*yield:\s*)/i);
      if (!m) continue;
      var textNode = firstMeaningfulTextNode(paragraphs[i]);
      if (!textNode) continue;
      var rest = textNode.textContent.slice(m[1].length);
      var qty = parseQty(rest);
      if (qty) return { node: textNode, original: textNode.textContent, parsed: qty, gap: m[1] };
    }
    return null;
  }

  function render(nodes, multiplier) {
    nodes.forEach(function (n) {
      n.node.textContent = multiplier === 1
        ? n.original
        : n.gap + formatParsed(n.parsed, multiplier);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var box = document.getElementById("scale-box");
    if (!box) return;
    var nodes = findIngredientNodes();
    var yieldNode = findYieldNode();
    if (yieldNode) nodes = nodes.concat([yieldNode]);
    if (!nodes.length) {
      box.style.display = "none";
      return;
    }

    function setMultiplier(m) {
      if (!m || m <= 0) return;
      render(nodes, m);
      Array.prototype.forEach.call(box.querySelectorAll("button"), function (btn) {
        btn.classList.toggle("active", parseFloat(btn.dataset.mult) === m);
      });
    }

    box.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.getElementById("scale-custom").value = "";
        setMultiplier(parseFloat(btn.dataset.mult));
      });
    });
    var custom = document.getElementById("scale-custom");
    custom.addEventListener("input", function () {
      var m = parseFloat(custom.value);
      if (m > 0) {
        Array.prototype.forEach.call(box.querySelectorAll("button"), function (btn) {
          btn.classList.remove("active");
        });
        render(nodes, m);
      }
    });
  });
})();
