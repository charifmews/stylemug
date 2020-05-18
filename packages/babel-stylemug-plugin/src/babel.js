import jsx from '@babel/plugin-syntax-jsx';
import evaluateSimple from 'babel-helper-evaluate-path';
import { compileSchema } from 'stylemug-compiler';

export function babelPlugin(babel) {
  const t = babel.types;

  function defineError(path, msg) {
    const node = t.cloneDeep(path.node);
    node.arguments[1] = t.stringLiteral(msg);
    path.replaceWith(node);
  }

  return {
    name: 'stylemug/babel',
    inherits: jsx,
    visitor: {
      ImportDeclaration(path) {
        const specifier = path.get('specifiers').find((specifier) => {
          return (
            specifier.isImportDefaultSpecifier() &&
            specifier.parent.source.value === 'stylemug'
          );
        });

        if (!specifier) {
          return;
        }

        const references = path.scope.getBinding(specifier.node.local.name)
          .referencePaths;

        // Collect each stylemug.create({}) reference.
        references.forEach((reference) => {
          const local = reference.parentPath.parentPath;

          let sheet = evaluateSimple(local.get('arguments')[0]);
          if (!sheet.confident) {
            defineError(
              local,
              'Failed to evaluate the following stylesheet: \n\n' +
                local.toString() +
                '\n\n' +
                'Make sure your stylesheet is statically defined.'
            );
            return;
          }

          try {
            sheet = compileSchema(sheet.value);
          } catch (error) {
            defineError(
              local,
              error && error.$$type === 'compilerError'
                ? error.message
                : 'The compiler failed with an unknown error.\n' +
                    'Would you be so kind to report the following error?\n\n' +
                    error.toString()
            );
            return;
          }

          const nextLocal = t.cloneDeep(local.node);
          nextLocal.arguments[0] = t.objectExpression(
            Object.entries(sheet).map(([name, rules]) => {
              return t.objectProperty(
                t.identifier(name),
                t.objectExpression(
                  Object.entries(rules).map(([hash, rule]) => {
                    return t.objectProperty(
                      t.identifier(rule.keyId),
                      t.stringLiteral(hash)
                    );
                  })
                )
              );
            })
          );

          local.replaceWith(nextLocal);
        });
      },
    },
  };
}
