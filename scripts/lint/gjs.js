export default {
	meta: { name: 'gjs' },
	rules: {
		'prefer-constructor': {
			meta: { type: 'suggestion', schema: [] },
			create(context) {
				return {
					'MethodDefinition[key.name="_init"] CallExpression[arguments.length<=1][callee.object.type="Super"][callee.property.name="_init"]'(
						node,
					) {
						context.report({ node, message: 'Use constructor() and super()' });
					},
				};
			},
		},
	},
};
