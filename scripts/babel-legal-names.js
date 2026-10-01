// Babel plugin for the LEGAL build (P8.5-30): every string the app's own code
// writes (string literals, template text, JSX text) goes through renameText()
// from src/data/legal-names.js, so "UEFA Champions League" ships as "European
// Cup" without a single screen being edited, and a string written next month is
// covered too. Only our files (never node_modules), and only when babel.config.js
// adds this plugin, which it does only when EXPO_PUBLIC_BRAND_MODE isn't `real`.
// Comments aren't strings, so the code's own notes keep the real names.
const { renameText } = require('../src/data/legal-names')

module.exports = function legalNames({ types: t }) {
  const ours = state => {
    const f = (state.filename || '').replace(/\\/g, '/')
    // Never the table itself: renaming its own "Champions League" entries would
    // leave renameText() renaming nothing at run time (club facts, stored runs).
    if (f.endsWith('/src/data/legal-names.js')) return false
    return !f.includes('/node_modules/') && /\/(app|src)\//.test(f)
  }
  return {
    name: 'pom-legal-names',
    visitor: {
      StringLiteral(path, state) {
        if (!ours(state)) return
        // Module paths never carry these names, but they're left alone on principle.
        if (path.parentPath.isImportDeclaration() || path.parentPath.isExportDeclaration()) return
        const next = renameText(path.node.value)
        if (next !== path.node.value) path.replaceWith(t.stringLiteral(next))
      },
      TemplateElement(path, state) {
        if (!ours(state)) return
        const { raw, cooked } = path.node.value
        const r = renameText(raw)
        if (r !== raw) path.node.value = { raw: r, cooked: cooked == null ? cooked : renameText(cooked) }
      },
      JSXText(path, state) {
        if (!ours(state)) return
        const next = renameText(path.node.value)
        if (next !== path.node.value) path.replaceWith(t.jsxText(next))
      },
    },
  }
}
