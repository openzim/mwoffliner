var join = require("path").join;
var homedir = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];

module.exports = expandHomeDir;

function expandHomeDir (path) {
  if (!path) return path;
  if (path == '~') return homedir;
  if (path.slice(0, 2) != '~/') return path;
  return join(homedir, path.slice(2));
}
