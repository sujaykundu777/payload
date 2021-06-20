const boolean = [
  {
    label: 'equals',
    value: 'equals',
  },
  {
    label: 'is not equal to',
    value: 'not_equals',
  },
];

const base = [
  ...boolean,
  {
    label: 'is in',
    value: 'in',
  },
  {
    label: 'is not in',
    value: 'not_in',
  },
  {
    label: 'exists',
    value: 'exists',
  },
];

const numeric = [
  ...base,
  {
    label: 'is greater than',
    value: 'greater_than',
  },
  {
    label: 'is less than',
    value: 'less_than',
  },
  {
    label: 'is less than or equal to',
    value: 'less_than_equal',
  },
  {
    label: 'is greater than or equal to',
    value: 'greater_than_equals',
  },
];

const like = {
  label: 'is like',
  value: 'like',
};

const fieldTypeConditions = {
  text: {
    component: 'Text',
    operators: [...base, like],
  },
  email: {
    component: 'Text',
    operators: [...base, like],
  },
  textarea: {
    component: 'Text',
    operators: [...base, like],
  },
  wysiwyg: {
    component: 'Text',
    operators: [...base, like],
  },
  code: {
    component: 'Text',
    operators: [...base, like],
  },
  number: {
    component: 'Number',
    operators: [...numeric],
  },
  date: {
    component: 'Date',
    operators: [...numeric],
  },
  upload: {
    component: 'Text',
    operators: [...base],
  },
  relationship: {
    component: 'Text',
    operators: [...base],
  },
  select: {
    component: 'Text',
    operators: [...base],
  },
  checkbox: {
    component: 'Text',
    operators: boolean,
  },
};

export default fieldTypeConditions;
