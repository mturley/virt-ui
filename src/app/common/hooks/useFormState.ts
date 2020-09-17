import { FormGroupProps, TextInputProps } from '@patternfly/react-core';
import * as React from 'react';
import * as yup from 'yup';
import { useDebounce } from 'use-debounce';
import equal from 'fast-deep-equal';

export interface IFormField<T> {
  value: T;
  setValue: (value: T) => void;
  isTouched: boolean;
  setIsTouched: (isTouched: boolean) => void;
  reset: () => void;
  schema: yup.Schema<T>;
}

export interface IValidatedFormField<T> extends IFormField<T> {
  error: yup.ValidationError | null;
  isValid: boolean;
}

type FormFields<FormValues> = {
  [key in keyof FormValues]: IFormField<FormValues[key]>;
};

type ValidatedFormFields<FormValues> = {
  [key in keyof FormValues]: IValidatedFormField<FormValues[key]>;
};

interface IFormStateOptions {
  yupOptions?: yup.ValidateOptions;
  debounceDuration?: number;
}

export interface IFormState<FormValues> {
  fields: ValidatedFormFields<FormValues>;
  values: FormValues; // For convenience in submitting forms (values are also included in fields property)
  isValid: boolean;
  reset: () => void;
  schema: yup.ObjectSchema | null; // In case you want to do anything fancy outside the hook
}

export const useFormField = <T>(
  initialValue: T,
  schema: yup.Schema<T>,
  options: { initialTouched?: boolean } = {}
): IFormField<T> => {
  const [value, setValue] = React.useState<T>(initialValue);
  const [isTouched, setIsTouched] = React.useState(options.initialTouched || false);
  return {
    value,
    setValue,
    isTouched,
    setIsTouched,
    reset: () => {
      setValue(initialValue);
      setIsTouched(options.initialTouched || false);
    },
    schema,
  };
};

// FormValues represents an interface of field key to field value type (the T in IFormField<T>).
// TypeScript can infer it from the arguments we pass to each useFormField!
export const useFormState = <FormValues>(
  fields: FormFields<FormValues>,
  options?: IFormStateOptions
): IFormState<FormValues> => {
  const yupOptions = options?.yupOptions || {};
  const debounceDuration = options?.debounceDuration || 5;

  const fieldKeys = Object.keys(fields) as (keyof FormValues)[];
  const values: FormValues = fieldKeys.reduce(
    (newObj, key) => ({ ...newObj, [key]: fields[key].value }),
    {} as FormValues
  );

  // Memoize the schema, only recompute if the field keys changed
  const [formSchema, setFormSchema] = React.useState<yup.ObjectSchema | null>(null);
  const lastFieldKeysRef = React.useRef(fieldKeys);
  React.useEffect(() => {
    if (!formSchema || !equal(lastFieldKeysRef.current, fieldKeys)) {
      lastFieldKeysRef.current = fieldKeys;
      const schemaShape = fieldKeys.reduce(
        (newObj, key) => ({ ...newObj, [key]: fields[key].schema }),
        {} as { [key in keyof FormValues]?: yup.Schema<FormValues[key]> }
      );
      setFormSchema(yup.object().shape(schemaShape).defined());
    }
  }, [fieldKeys, fields, formSchema]);

  // Memoize the validation, only recompute if the field values changed
  const [validationError, setValidationError] = React.useState<yup.ValidationError | null>(null);
  const [hasRunInitialValidation, setHasRunInitialValidation] = React.useState(false);
  const [debouncedValues] = useDebounce(values, debounceDuration); // Wait 20ms for the user to finish typing before validating
  const lastValuesRef = React.useRef(debouncedValues);
  React.useEffect(() => {
    if (
      formSchema &&
      (!hasRunInitialValidation || !equal(lastValuesRef.current, debouncedValues))
    ) {
      console.log('Running validation!');
      setHasRunInitialValidation(true);
      lastValuesRef.current = debouncedValues;
      formSchema
        .validate(debouncedValues, { abortEarly: false, ...yupOptions })
        .then(() => setValidationError(null))
        .catch((e) => {
          const newRootError = e as yup.ValidationError;
          if (!validationError || !equal(validationError.errors, newRootError.errors)) {
            setValidationError(newRootError);
            console.log('validation done!');
          }
        });
    }
  }, [debouncedValues, formSchema, hasRunInitialValidation, validationError, yupOptions]);

  type ErrorsByField = { [key in keyof FormValues]: yup.ValidationError };
  const errorsByField =
    validationError?.inner.reduce(
      (newObj, error) => ({ ...newObj, [error.path]: error }),
      {} as ErrorsByField
    ) || ({} as ErrorsByField);

  const validatedFields: ValidatedFormFields<FormValues> = fieldKeys.reduce((newObj, key) => {
    const field = fields[key];
    const error = errorsByField ? errorsByField[key] : null;
    const validatedField: IValidatedFormField<FormValues[keyof FormValues]> = {
      ...field,
      error,
      isValid: !error || !field.isTouched,
    };
    return { ...newObj, [key]: validatedField };
  }, {} as ValidatedFormFields<FormValues>);

  return {
    fields: validatedFields,
    values,
    isValid: hasRunInitialValidation && !validationError,
    reset: () => fieldKeys.forEach((key) => fields[key].reset()),
    schema: formSchema,
  };
};

// PatternFly-specific rendering helpers for FormGroup and TextInput components:

export const getFormGroupProps = <T>(
  field: IValidatedFormField<T>
): Pick<FormGroupProps, 'validated' | 'helperTextInvalid'> => ({
  validated: field.isValid ? 'default' : 'error',
  helperTextInvalid: field.error?.message,
});

export const getTextInputProps = (
  field: IValidatedFormField<string>
): Pick<TextInputProps, 'value' | 'onChange' | 'onBlur' | 'validated'> => ({
  value: field.value,
  onChange: field.setValue,
  onBlur: () => field.setIsTouched(true),
  validated: field.isValid ? 'default' : 'error',
});
