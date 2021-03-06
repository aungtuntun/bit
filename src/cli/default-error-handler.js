// @flow
// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import chalk from 'chalk';
import hashErrorIfNeeded from '../error/hash-error-object';
import { InvalidBitId, InvalidIdChunk, InvalidName, InvalidScopeName } from '../bit-id/exceptions';
import {
  ConsumerAlreadyExists,
  NothingToImport,
  ConsumerNotFound,
  ComponentSpecsFailed,
  ComponentOutOfSync,
  MissingDependencies,
  NewerVersionFound,
  LoginFailed
} from '../consumer/exceptions';
import { DriverNotFound } from '../driver';
import ComponentNotFoundInPath from '../consumer/component/exceptions/component-not-found-in-path';
import MissingFilesFromComponent from '../consumer/component/exceptions/missing-files-from-component';
import PluginNotFound from '../consumer/component/exceptions/plugin-not-found';
import PermissionDenied from '../scope/network/exceptions/permission-denied';
import {
  NetworkError,
  UnexpectedNetworkError,
  SSHInvalidResponse,
  ProtocolNotSupported,
  RemoteScopeNotFound,
  AuthenticationFailed
} from '../scope/network/exceptions';
import RemoteNotFound from '../remotes/exceptions/remote-not-found';
import {
  ScopeNotFound,
  ScopeJsonNotFound,
  ResolutionException,
  ComponentNotFound,
  DependencyNotFound,
  CorruptedComponent,
  VersionAlreadyExists,
  MergeConflict,
  InvalidIndexJson,
  HashMismatch,
  MergeConflictOnRemote,
  OutdatedIndexJson,
  VersionNotFound,
  CyclicDependencies,
  HashNotFound
} from '../scope/exceptions';
import InvalidBitJson from '../consumer/bit-json/exceptions/invalid-bit-json';
import InvalidVersion from '../api/consumer/lib/exceptions/invalid-version';
import NoIdMatchWildcard from '../api/consumer/lib/exceptions/no-id-match-wildcard';
import NothingToCompareTo from '../api/consumer/lib/exceptions/nothing-to-compare-to';
import PromptCanceled from '../prompts/exceptions/prompt-canceled';
import IdExportedAlready from '../api/consumer/lib/exceptions/id-exported-already';
import FileSourceNotFound from '../consumer/component/exceptions/file-source-not-found';
import { MissingMainFile, MissingBitMapComponent, InvalidBitMap } from '../consumer/bit-map/exceptions';
import logger from '../logger/logger';
import RemoteUndefined from './commands/exceptions/remote-undefined';
import AddTestsWithoutId from './commands/exceptions/add-tests-without-id';
import componentIssuesTemplate from './templates/component-issues-template';
import newerVersionTemplate from './templates/newer-version-template';
import {
  PathsNotExist,
  IncorrectIdForImportedComponent,
  DuplicateIds,
  NoFiles,
  EmptyDirectory,
  MissingComponentIdForImportedComponent,
  VersionShouldBeRemoved,
  TestIsDirectory,
  MainFileIsDir,
  MissingMainFileMultipleComponents,
  ExcludedMainFile
} from '../consumer/component-ops/add-components/exceptions';
import { Analytics, LEVEL } from '../analytics/analytics';
import ExternalTestErrors from '../consumer/component/exceptions/external-test-errors';
import ExternalBuildErrors from '../consumer/component/exceptions/external-build-errors';
import InvalidCompilerInterface from '../consumer/component/exceptions/invalid-compiler-interface';
import ExtensionFileNotFound from '../extensions/exceptions/extension-file-not-found';
import ExtensionNameNotValid from '../extensions/exceptions/extension-name-not-valid';
import GeneralError from '../error/general-error';
import ValidationError from '../error/validation-error';
import AbstractError from '../error/abstract-error';
import { PathToNpmrcNotExist, WriteToNpmrcError } from '../consumer/login/exceptions';
import ExtensionLoadError from '../extensions/exceptions/extension-load-error';
import ExtensionGetDynamicPackagesError from '../extensions/exceptions/extension-get-dynamic-packages-error';
import ExtensionGetDynamicConfigError from '../extensions/exceptions/extension-get-dynamic-config-error';
import ExtensionInitError from '../extensions/exceptions/extension-init-error';
import MainFileRemoved from '../consumer/component/exceptions/main-file-removed';
import InvalidConfigDir from '../consumer/bit-map/exceptions/invalid-config-dir';
import EjectToWorkspace from '../consumer/component/exceptions/eject-to-workspace';
import EjectBoundToWorkspace from '../consumer/component/exceptions/eject-bound-to-workspace';
import EjectNoDir from '../consumer/component-ops/exceptions/eject-no-dir';
import { COMPONENT_DIR, DEBUG_LOG } from '../constants';
import InjectNonEjected from '../consumer/component/exceptions/inject-non-ejected';
import ExtensionSchemaError from '../extensions/exceptions/extension-schema-error';
import GitNotFound from '../utils/git/exceptions/git-not-found';
import ObjectsWithoutConsumer from '../api/consumer/lib/exceptions/objects-without-consumer';

const reportIssueToGithubMsg =
  'This error should have never happened. Please report this issue on Github https://github.com/teambit/bit/issues';

const errorsMap: Array<[Class<Error>, (err: Class<Error>) => string]> = [
  [
    RemoteUndefined,
    () =>
      chalk.red(
        'error: remote url must be defined. please use: `ssh://`, `file://` or `bit://` protocols to define remote access'
      )
  ],
  [
    AddTestsWithoutId,
    () =>
      chalk.yellow(
        `please specify a component ID to add test files to an existing component. \n${chalk.bold(
          'example: bit add --tests [test_file_path] --id [component_id]'
        )}`
      )
  ],
  [ConsumerAlreadyExists, () => 'workspace already exists'],
  [GeneralError, err => `${err.msg}`],

  [VersionAlreadyExists, err => `error: version ${err.version} already exists for ${err.componentId}`],
  [ConsumerNotFound, () => 'workspace not found. to initiate a new workspace, please use `bit init`'],
  [LoginFailed, () => 'error: there was a problem with web authentication'],

  // [
  //   PluginNotFound,
  //   err => `error: The compiler "${err.plugin}" is not installed, please use "bit install ${err.plugin}" to install it.`
  // ],
  [FileSourceNotFound, err => `file or directory "${err.path}" was not found`],
  [ExtensionFileNotFound, err => `file "${err.path}" was not found`],
  [
    ExtensionNameNotValid,
    err =>
      `error: the extension name "${
        err.name
      }" is not a valid component id (it must contain a scope name) fix it on your bit.json file`
  ],
  [
    ProtocolNotSupported,
    () => 'error: remote scope protocol is not supported, please use: `ssh://`, `file://` or `bit://`'
  ],
  [RemoteScopeNotFound, err => `error: remote scope "${chalk.bold(err.name)}" was not found.`],
  [InvalidBitId, () => 'error: component ID is invalid, please use the following format: [scope]/<name>'],
  [InvalidConfigDir, err => `error: the eject path is already part of "${chalk.bold(err.compId)}" path`],
  [EjectToWorkspace, () => 'error: could not eject config to the workspace root please provide a valid path'],
  [
    EjectBoundToWorkspace,
    () => 'error: could not eject config for authored component which are bound to the workspace configuration'
  ],
  [InjectNonEjected, () => 'error: could not inject config for already injected component'],
  [
    EjectNoDir,
    err =>
      `error: could not eject config for ${chalk.bold(
        err.compId
      )}, please provide path which doesn't contain {${COMPONENT_DIR}} to eject`
  ],
  [
    ComponentNotFound,
    (err) => {
      const msg = err.dependentId
        ? `error: the component dependency "${chalk.bold(err.id)}" required by "${chalk.bold(
          err.dependentId
        )}" was not found`
        : `error: component "${chalk.bold(err.id)}" was not found`;
      return msg;
    }
  ],
  [
    CorruptedComponent,
    err =>
      `error: the model representation of "${chalk.bold(err.id)}" is corrupted, the object of version ${
        err.version
      } is missing.\n${reportIssueToGithubMsg}`
  ],
  [
    DependencyNotFound,
    err =>
      `error: dependency "${chalk.bold(
        err.id
      )}" was not found. please track this component or use --ignore-unresolved-dependencies flag (not recommended)`
  ],
  [EmptyDirectory, () => chalk.yellow('directory is empty, no files to add')],
  [ValidationError, err => `${err.message}\n${reportIssueToGithubMsg}`],
  [ComponentNotFoundInPath, err => `error: component in path "${chalk.bold(err.path)}" was not found`],
  [
    PermissionDenied,
    err =>
      `error: permission to scope ${
        err.scope
      } was denied\nsee troubleshooting at https://docs.bitsrc.io/docs/authentication-issues.html`
  ],
  [RemoteNotFound, err => `error: remote "${chalk.bold(err.name)}" was not found`],
  [NetworkError, err => `error: remote failed with error the following error:\n "${chalk.bold(err.remoteErr)}"`],
  [
    HashMismatch,
    err => `found hash mismatch of ${chalk.bold(err.id)}, version ${chalk.bold(err.version)}.
  originalHash: ${chalk.bold(err.originalHash)}.
  currentHash: ${chalk.bold(err.currentHash)}
  this usually happens when a component is old and the migration script was not running or interrupted`
  ],
  [HashNotFound, err => `hash ${chalk.bold(err.hash)} not found`],
  [
    MergeConflict,
    err =>
      `error: merge conflict occurred while importing the component ${err.id}. conflict version(s): ${err.versions.join(
        ', '
      )}
to resolve it and merge your local and remote changes, please do the following:
1) bit untag ${err.id} ${err.versions.join(' ')}
2) bit import
3) bit checkout ${err.versions.join(' ')} ${err.id}
once your changes are merged with the new remote version, you can tag and export a new version of the component to the remote scope.`
  ],
  [
    MergeConflictOnRemote,
    err =>
      `error: merge conflict occurred when exporting the component(s) ${err.idsAndVersions
        .map(i => `${chalk.bold(i.id)} (version(s): ${i.versions.join(', ')})`)
        .join(', ')} to the remote scope.
to resolve this conflict and merge your remote and local changes, please do the following:
1) bit untag [id] [version]
2) bit import
3) bit checkout [version] [id]
once your changes are merged with the new remote version, please tag and export a new version of the component to the remote scope.`
  ],
  [
    OutdatedIndexJson,
    err => `error: component ${chalk.bold(
      err.componentId
    )} found in the index.json file, however, is missing from the scope.
to get the file rebuild, please delete it at "${err.indexJsonPath}".\n${reportIssueToGithubMsg}
`
  ],
  [CyclicDependencies, err => `${err.msg.toString().toLocaleLowerCase()}`],
  [
    UnexpectedNetworkError,
    err => `error: unexpected network error has occurred. ${err.message ? ` original message: ${err.message}` : ''}`
  ],
  [
    SSHInvalidResponse,
    () => `error: received an invalid response from the remote SSH server.
to see the invalid response, have a look at the log, located at ${DEBUG_LOG}`
  ],
  [
    InvalidIndexJson,
    err => `fatal: your .bit/index.json is not a valid JSON file.
To rebuild the file, please run ${chalk.bold('bit init --reset')}.
Original Error: ${err.message}`
  ],
  [ScopeNotFound, () => 'error: workspace not found. to create a new workspace, please use `bit init`'],
  [
    ScopeJsonNotFound,
    err =>
      `error: scope.json file was not found at ${chalk.bold(err.path)}, please use ${chalk.bold(
        'bit init'
      )} to recreate the file`
  ],
  [
    ComponentSpecsFailed,
    err =>
      `${
        err.specsResultsAndIdPretty
      }component tests failed. please make sure all tests pass before tagging a new version or use the "--force" flag to force-tag components.\nto view test failures, please use the "--verbose" flag or use the "bit test" command`
  ],
  [
    ComponentOutOfSync,
    err => `component ${chalk.bold(err.id)} is not in-sync between the consumer and the scope.
if it is originated from another git branch, go back to that branch to continue working on the component.
if possible, remove the component using "bit remove" and re-import or re-create it.
to re-start Bit from scratch, deleting all objects from the scope, use "bit init --reset-hard"`
  ],
  [
    MissingDependencies,
    (err) => {
      const missingDepsColored = componentIssuesTemplate(err.components);
      return `error: issues found with the following component dependencies\n${missingDepsColored}`;
    }
  ],
  [
    NothingToImport,
    () =>
      chalk.yellow(
        'nothing to import. please use `bit import [component_id]` or configure your dependencies in bit.json'
      )
  ],
  [
    InvalidIdChunk,
    err =>
      `error: "${chalk.bold(
        err.id
      )}" is invalid, component IDs can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
  ],
  [
    InvalidName,
    err =>
      `error: "${chalk.bold(
        err.componentName
      )}" is invalid, component names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!", "/"]`
  ],
  [
    InvalidScopeName,
    err =>
      `error: "${chalk.bold(
        err.scopeName
      )}" is invalid, component scope names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
  ],
  [
    InvalidBitJson,
    err => `error: invalid bit.json: ${chalk.bold(err.path)} is not a valid JSON file.
    consider running ${chalk.bold('bit init --reset')} to recreate the file`
  ],
  [
    DriverNotFound,
    err =>
      `error: a client-driver ${chalk.bold(err.driver)} is missing for the language ${chalk.bold(
        err.lang
      )} set in your bit.json file.`
  ],
  [
    MissingMainFile,
    err =>
      `error: the component ${chalk.bold(
        err.componentId
      )} does not contain a main file.\nplease either use --id to group all added files as one component or use our DSL to define the main file dynamically.\nsee troubleshooting at https://docs.bitsrc.io/docs/isolating-and-tracking-components.html#define-a-components-main-file`
  ],
  [
    MissingMainFileMultipleComponents,
    err =>
      `error: the components ${chalk.bold(
        err.componentIds.join(', ')
      )} does not contain a main file.\nplease either use --id to group all added files as one component or use our DSL to define the main file dynamically.\nsee troubleshooting at https://docs.bitsrc.io/docs/isolating-and-tracking-components.html#define-a-components-main-file`
  ],
  [
    InvalidBitMap,
    err =>
      `error: unable to parse your bitMap file at ${chalk.bold(err.path)}, due to an error ${chalk.bold(
        err.errorMessage
      )}.
      consider running ${chalk.bold('bit init --reset')} to recreate the file`
  ],
  [ExcludedMainFile, err => `error: main file ${chalk.bold(err.mainFile)} was excluded from file list`],
  [
    MainFileRemoved,
    err => `error: main file ${chalk.bold(err.mainFile)} was removed from ${chalk.bold(err.id)}.
please use "bit remove" to delete the component or "bit add" with "--main" and "--id" flags to add a new mainFile`
  ],
  [
    VersionShouldBeRemoved,
    err => `please remove the version part from the specified id ${chalk.bold(err.id)} and try again`
  ],
  [
    TestIsDirectory,
    err =>
      `error: the specified test path ${chalk.bold(err.path)} is a directory, please specify a file or a pattern DSL`
  ],
  [
    MainFileIsDir,
    err =>
      `error: the specified main path ${chalk.bold(
        err.mainFile
      )} is a directory, please specify a file or a pattern DSL`
  ],
  [
    MissingFilesFromComponent,
    (err) => {
      return `component ${
        err.id
      } is invalid as part or all of the component files were deleted. please use \'bit remove\' to resolve the issue`;
    }
  ],
  [
    MissingBitMapComponent,
    err =>
      `error: component "${chalk.bold(
        err.id
      )}" was not found on your local workspace.\nplease specify a valid component ID or track the component using 'bit add' (see 'bit add --help' for more information)`
  ],
  [PathsNotExist, err => `error: file or directory "${chalk.bold(err.paths.join(', '))}" was not found.`],
  [WriteToNpmrcError, err => `unable to add @bit as a scoped registry at "${chalk.bold(err.path)}"`],
  [PathToNpmrcNotExist, err => `error: file or directory "${chalk.bold(err.path)}" was not found.`],

  [VersionNotFound, err => `error: version "${chalk.bold(err.version)}" was not found.`],
  [
    MissingComponentIdForImportedComponent,
    err =>
      `error: unable to add new files to the component "${chalk.bold(
        err.id
      )}" without specifying a component ID. please define the component ID using the --id flag.`
  ],
  [
    IncorrectIdForImportedComponent,
    err =>
      `error: trying to add a file ${chalk.bold(err.filePath)} to a component-id "${chalk.bold(
        err.newId
      )}", however, this file already belong to "${chalk.bold(err.importedId)}"`
  ],
  [
    NoFiles,
    err =>
      chalk.yellow('warning: no files to add') +
      chalk.yellow(err.ignoredFiles ? `, the following files were ignored: ${chalk.bold(err.ignoredFiles)}` : '')
  ],
  [
    DuplicateIds,
    err =>
      Object.keys(err.componentObject)
        .map((key) => {
          return `unable to add ${
            Object.keys(err.componentObject[key]).length
          } components with the same ID: ${chalk.bold(key)} : ${err.componentObject[key]}\n`;
        })
        .join(' ')
  ],

  [IdExportedAlready, err => `component ${chalk.bold(err.id)} has been already exported to ${chalk.bold(err.remote)}`],
  [
    InvalidVersion,
    err => `error: version ${chalk.bold(err.version)} is not a valid semantic version. learn more: https://semver.org`
  ],
  [
    NoIdMatchWildcard,
    err => `unable to find component ids that match the following: ${err.idsWithWildcards.join(', ')}`
  ],
  [NothingToCompareTo, err => 'no previous versions to compare'],
  [
    NewerVersionFound,
    // err => JSON.stringify(err.newerVersions)
    err => newerVersionTemplate(err.newerVersions)
  ],
  [PromptCanceled, err => chalk.yellow('operation aborted')],
  [
    ExternalTestErrors,
    err =>
      `error: bit failed to test ${err.id} with the following exception:\n${getExternalErrorsMessageAndStack(
        err.originalErrors
      )}`
  ],
  [
    ExternalBuildErrors,
    err =>
      `error: bit failed to build ${err.id} with the following exception:\n${getExternalErrorsMessageAndStack(
        err.originalErrors
      )}`
  ],
  [
    ExtensionLoadError,
    err =>
      `error: bit failed to load ${err.compName} with the following exception:\n${getExternalErrorMessage(
        err.originalError
      )}.\n${err.printStack ? err.originalError.stack : ''}`
  ],
  [
    ExtensionSchemaError,
    err => `error: configuration passed to extension ${chalk.bold(err.extensionName)} is invalid:\n${err.errors}`
  ],
  [
    ExtensionInitError,
    err =>
      `error: bit failed to initialized ${err.compName} with the following exception:\n${getExternalErrorMessage(
        err.originalError
      )}.\n${err.originalError.stack}`
  ],
  [
    ExtensionGetDynamicPackagesError,
    err =>
      `error: bit failed to get the dynamic packages from ${err.compName} with the following exception:\n${
        err.originalError.message
      }.\n${err.originalError.stack}`
  ],
  [
    ExtensionGetDynamicConfigError,
    err =>
      `error: bit failed to get the config from ${err.compName} with the following exception:\n${
        err.originalError.message
      }.\n${err.originalError.stack}`
  ],
  [
    InvalidCompilerInterface,
    err => `"${err.compilerName}" does not have a valid compiler interface, it has to expose a compile method`
  ],
  [
    ResolutionException,
    err =>
      `error: bit failed to require ${err.filePath} due to the following exception:\n${getExternalErrorMessage(
        err.originalError
      )}.\n${err.originalError.stack}`
  ],
  [
    GitNotFound,
    err =>
      "error: unable to run command because git executable not found. please ensure git is installed and/or git_path is configured using the 'bit config set git_path <GIT_PATH>'"
  ],
  [
    AuthenticationFailed,
    err => 'authentication failed. see troubleshooting at https://docs.bitsrc.io/docs/authentication-issues.html'
  ],
  [
    ObjectsWithoutConsumer,
    err => `error: unable to initialize a bit workspace. bit has found undeleted local objects at ${chalk.bold(
      err.scopePath
    )}.
1. use the ${chalk.bold('--reset-hard')} flag to clear all data and initialize an empty workspace.
2. if deleted by mistake, please restore .bitmap and bit.json.
3. force workspace initialization without clearing data use the ${chalk.bold('--force')} flag.`
  ]
];

function findErrorDefinition(err: Error) {
  const error = errorsMap.find(([ErrorType]) => {
    return err instanceof ErrorType || err.name === ErrorType.name; // in some cases, such as forked process, the received err is serialized.
  });
  return error;
}

function getErrorFunc(errorDefinition) {
  if (!errorDefinition) return null;
  const [, func] = errorDefinition;
  return func;
}

function getErrorMessage(error: ?Error, func: ?Function): string {
  if (!error || !func) return '';
  const errorMessage = func(error);
  return errorMessage;
}

function getExternalErrorMessage(externalError: ?Error): string {
  if (!externalError) return '';

  // In case an error is not a real error
  if (!(externalError instanceof Error)) {
    return externalError;
  }
  // In case it's not a bit error
  if (externalError.message) {
    return externalError.message;
  }
  const errorDefinition = findErrorDefinition(externalError);
  const func = getErrorFunc(errorDefinition);
  const errorMessage = getErrorMessage(externalError, func);
  return errorMessage;
}

function getExternalErrorsMessageAndStack(errors: Error[]): string {
  const result = errors
    .map((e) => {
      const msg = getExternalErrorMessage(e);
      const stack = e.stack || '';
      return `${msg}\n${stack}\n`;
    })
    .join('~~~~~~~~~~~~~\n');
  return result;
}

/**
 * if err.userError is set, it inherits from AbstractError, which are user errors not Bit errors
 * and should not be reported to Sentry.
 * reason why we don't check (err instanceof AbstractError) is that it could be thrown from a fork,
 * in which case, it loses its class and has only the fields.
 */
function sendToAnalyticsAndSentry(err) {
  const possiblyHashedError = hashErrorIfNeeded(err);
  // only level FATAL are reported to Sentry.
  // $FlowFixMe
  const level = err.isUserError ? LEVEL.INFO : LEVEL.FATAL;
  Analytics.setError(level, possiblyHashedError);
}

export default (err: Error): ?string => {
  const errorDefinition = findErrorDefinition(err);
  sendToAnalyticsAndSentry(err);
  if (!errorDefinition) {
    return chalk.red(err.message || err);
  }
  const func = getErrorFunc(errorDefinition);
  const errorMessage = getErrorMessage(err, func) || 'unknown error';
  err.message = errorMessage;
  logger.error(`User gets the following error: ${errorMessage}`);
  return chalk.red(errorMessage);
};
