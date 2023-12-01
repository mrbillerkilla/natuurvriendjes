const currentTitle = "milieu vriendjes",
  changableTitle = "Kom terug👉👈🥺"

window.addEventListener("blur", function() {

  return this.document.title = changableTitle;
});

window.addEventListener("focus", function() {

  return this.document.title = currentTitle;
});