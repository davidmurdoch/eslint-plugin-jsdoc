import escapeStringRegexp from 'escape-string-regexp';
import iterateJsdoc from '../iterateJsdoc';

// https://babeljs.io/docs/en/babel-plugin-transform-react-jsx/
const jsxTagNames = new Set([
  'jsx',
  'jsxFrag',
  'jsxImportSource',
  'jsxRuntime',
]);

const typedTagsAlwaysUnnecessary = new Set([
  'augments',
  'callback',
  'class',
  'enum',
  'implements',
  'private',
  'property',
  'protected',
  'public',
  'readonly',
  'this',
  'type',
  'typedef',
]);

const typedTagsUnnecessaryOutsideDeclare = new Set([
  'abstract',
  'access',
  'class',
  'constant',
  'constructs',
  'default',
  'enum',
  'export',
  'exports',
  'function',
  'global',
  'inherits',
  'instance',
  'interface',
  'member',
  'memberof',
  'memberOf',
  'method',
  'mixes',
  'mixin',
  'module',
  'name',
  'namespace',
  'override',
  'property',
  'requires',
  'static',
  'this',
]);

export default iterateJsdoc(({
  sourceCode,
  jsdoc,
  report,
  utils,
  context,
  node,
  settings,
  jsdocNode,
}) => {
  const {
    definedTags = [],
    jsxTags,
    typed,
  } = context.options[0] || {};

  let definedPreferredTags = [];
  const {
    tagNamePreference,
    structuredTags,
  } = settings;
  const definedStructuredTags = Object.keys(structuredTags);
  const definedNonPreferredTags = Object.keys(tagNamePreference);
  if (definedNonPreferredTags.length) {
    definedPreferredTags = Object.values(tagNamePreference).map((preferredTag) => {
      if (typeof preferredTag === 'string') {
        // May become an empty string but will be filtered out below
        return preferredTag;
      }

      if (!preferredTag) {
        return undefined;
      }

      if (typeof preferredTag !== 'object') {
        utils.reportSettings(
          'Invalid `settings.jsdoc.tagNamePreference`. Values must be falsy, a string, or an object.',
        );
      }

      return preferredTag.replacement;
    })
      .filter((preferredType) => {
        return preferredType;
      });
  }

  const isInAmbientContext = (subNode) => {
    return subNode.type === 'Program' ?
      context.getFilename().endsWith('.d.ts') :
      Boolean(subNode.declare) || isInAmbientContext(subNode.parent);
  };

  const tagIsRedundantWhenTyped = (jsdocTag) => {
    if (!typedTagsUnnecessaryOutsideDeclare.has(jsdocTag.tag)) {
      return false;
    }

    if (jsdocTag.name === 'default') {
      return false;
    }

    if (context.getFilename().endsWith('.d.ts') && node.parent.type === 'Program') {
      return false;
    }

    if (isInAmbientContext(node)) {
      return false;
    }

    return true;
  };

  const reportWithTypeRemovalFixer = (message, jsdocTag, tagIndex, additionalTagChanges) => {
    utils.reportJSDoc(message, jsdocTag, () => {
      if (jsdocTag.description.trim()) {
        utils.changeTag(jsdocTag, {
          postType: '',
          type: '',
          ...additionalTagChanges,
        });
      } else {
        utils.removeTag(tagIndex, {
          removeEmptyBlock: true,
        });
      }
    }, true);
  };

  const checkTagForTypedValidity = (jsdocTag, tagIndex) => {
    if (typedTagsAlwaysUnnecessary.has(jsdocTag.tag)) {
      reportWithTypeRemovalFixer(`'@${jsdocTag.tag}' is redundant when using a type system.`, jsdocTag, tagIndex, {
        postTag: '',
        tag: '',
      });
      return true;
    }

    if (tagIsRedundantWhenTyped(jsdocTag)) {
      reportWithTypeRemovalFixer(`'@${jsdocTag.tag}' is redundant outside of ambient (\`declare\`/\`.d.ts\`) contexts when using a type system.`, jsdocTag, tagIndex);
      return true;
    }

    if (jsdocTag.tag === 'template' && !jsdocTag.name) {
      reportWithTypeRemovalFixer('\'@template\' without a name is redundant when using a type system.', jsdocTag, tagIndex);
      return true;
    }

    return false;
  };

  for (let tagIndex = 0; tagIndex < jsdoc.tags.length; tagIndex += 1) {
    const jsdocTag = jsdoc.tags[tagIndex];
    const tagName = jsdocTag.tag;
    if (jsxTags && jsxTagNames.has(tagName)) {
      continue;
    }

    if (typed && checkTagForTypedValidity(jsdocTag, tagIndex)) {
      continue;
    }

    if (utils.isValidTag(tagName, [
      ...definedTags, ...definedPreferredTags, ...definedNonPreferredTags,
      ...definedStructuredTags,
    ])) {
      let preferredTagName = utils.getPreferredTagName({
        allowObjectReturn: true,
        defaultMessage: `Blacklisted tag found (\`@${tagName}\`)`,
        tagName,
      });
      if (!preferredTagName) {
        continue;
      }

      let message;
      if (typeof preferredTagName === 'object') {
        ({
          message,
          replacement: preferredTagName,
        } = preferredTagName);
      }

      if (!message) {
        message = `Invalid JSDoc tag (preference). Replace "${tagName}" JSDoc tag with "${preferredTagName}".`;
      }

      if (preferredTagName !== tagName) {
        report(message, (fixer) => {
          const replacement = sourceCode.getText(jsdocNode).replace(
            new RegExp(`@${escapeStringRegexp(tagName)}\\b`, 'u'),
            `@${preferredTagName}`,
          );

          return fixer.replaceText(jsdocNode, replacement);
        }, jsdocTag);
      }
    } else {
      report(`Invalid JSDoc tag name "${tagName}".`, null, jsdocTag);
    }
  }
}, {
  iterateAllJsdocs: true,
  meta: {
    docs: {
      description: 'Reports invalid block tag names.',
      url: 'https://github.com/gajus/eslint-plugin-jsdoc#eslint-plugin-jsdoc-rules-check-tag-names',
    },
    fixable: 'code',
    schema: [
      {
        additionalProperties: false,
        properties: {
          definedTags: {
            items: {
              type: 'string',
            },
            type: 'array',
          },
          jsxTags: {
            type: 'boolean',
          },
          typed: {
            type: 'boolean',
          },
        },
        type: 'object',
      },
    ],
    type: 'suggestion',
  },
});
