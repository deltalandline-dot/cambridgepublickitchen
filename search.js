(function () {
  var input = document.getElementById("query");
  var status = document.getElementById("status");
  var results = document.getElementById("results");
  var recipes = null;

  fetch("search-index.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      recipes = data;
      status.textContent = "";
      if (input.value.trim()) render();
    })
    .catch(function () {
      status.textContent = "Couldn't load the recipe index.";
    });

  function terms(query) {
    return query
      .toLowerCase()
      .split(",")
      .map(function (t) { return t.trim(); })
      .filter(Boolean);
  }

  function occurrences(text, term) {
    return text.split(term).length - 1;
  }

  function render() {
    var q = terms(input.value);
    results.innerHTML = "";
    if (!q.length) {
      status.textContent = "";
      return;
    }
    if (!recipes) {
      status.textContent = "Loading recipes…";
      return;
    }

    var matches = recipes
      .map(function (recipe) {
        var matchedTerms = q.filter(function (t) { return recipe.text.indexOf(t) !== -1; });
        var count = matchedTerms.reduce(function (sum, t) {
          return sum + occurrences(recipe.text, t);
        }, 0);
        return { recipe: recipe, matchedTerms: matchedTerms.length, count: count };
      })
      .filter(function (m) { return m.matchedTerms > 0; })
      .sort(function (a, b) {
        return b.matchedTerms - a.matchedTerms || b.count - a.count ||
          a.recipe.title.localeCompare(b.recipe.title);
      });

    status.textContent = matches.length
      ? matches.length + " recipe" + (matches.length === 1 ? "" : "s")
      : "No recipes match that.";

    matches.forEach(function (m) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = m.recipe.url;
      a.textContent = m.recipe.title;
      li.appendChild(a);
      var span = document.createElement("span");
      span.className = "match-count";
      span.textContent = " — matches " + m.matchedTerms + "/" + q.length + " ingredient" +
        (q.length === 1 ? "" : "s");
      li.appendChild(span);
      results.appendChild(li);
    });
  }

  var debounce;
  input.addEventListener("input", function () {
    clearTimeout(debounce);
    debounce = setTimeout(render, 120);
  });
})();
