'use strict';

const { PostgresUserRepository, PostgresUserPermissionsRepository, PostgresProjectUsersRepository } = require('./implementations/postgres/PostgresUserRepository');
const { PostgresProjectRepository } = require('./implementations/postgres/PostgresProjectRepository');
const { PostgresUseCaseRepository } = require('./implementations/postgres/PostgresUseCaseRepository');
const { PostgresUserStoryRepository, PostgresScenarioRepository, PostgresInconsistenciaRepository } = require('./implementations/postgres/PostgresUserStoryRepository');
const { PostgresTestSuiteRepository, PostgresTestCaseRepository, PostgresTestRunRepository, PostgresExecutionRepository } = require('./implementations/postgres/PostgresTestSuiteRepository');
const { PostgresAttachmentRepository, PostgresDefectRepository, PostgresPreconditionRepository, PostgresTcPreconditionsRepository, PostgresProjectSequenceRepository, PostgresJiraConfigsRepository, PostgresJiraUserConfigsRepository } = require('./implementations/postgres/PostgresAttachmentRepository');
const { PostgresBaseRepository } = require('./implementations/postgres/PostgresBaseRepository');

const { SupabaseUserRepository, SupabaseUserPermissionsRepository, SupabaseProjectUsersRepository } = require('./implementations/supabase/SupabaseUserRepository');
const { SupabaseProjectRepository } = require('./implementations/supabase/SupabaseProjectRepository');
const { SupabaseUseCaseRepository } = require('./implementations/supabase/SupabaseUseCaseRepository');
const { SupabaseUserStoryRepository, SupabaseScenarioRepository, SupabaseInconsistenciaRepository } = require('./implementations/supabase/SupabaseUserStoryRepository');
const { SupabaseTestSuiteRepository, SupabaseTestCaseRepository, SupabaseTestRunRepository, SupabaseExecutionRepository } = require('./implementations/supabase/SupabaseTestSuiteRepository');
const { SupabaseAttachmentRepository, SupabaseDefectRepository, SupabasePreconditionRepository, SupabaseTcPreconditionsRepository, SupabaseProjectSequenceRepository, SupabaseJiraConfigsRepository, SupabaseJiraUserConfigsRepository } = require('./implementations/supabase/SupabaseAttachmentRepository');
const { SupabaseBaseRepository } = require('./implementations/supabase/SupabaseBaseRepository');

const { getSupabaseClient } = require('../config/supabase');

function createPostgresRepositories() {
    const base = new PostgresBaseRepository();
    const opts = { base };
    return {
        impl: 'postgres',
        users: new PostgresUserRepository(opts),
        usersPermissions: new PostgresUserPermissionsRepository(opts),
        projectUsers: new PostgresProjectUsersRepository(opts),
        projects: new PostgresProjectRepository(opts),
        useCases: new PostgresUseCaseRepository(opts),
        userStories: new PostgresUserStoryRepository(opts),
        scenarios: new PostgresScenarioRepository(opts),
        inconsistencias: new PostgresInconsistenciaRepository(opts),
        testSuites: new PostgresTestSuiteRepository(opts),
        testCases: new PostgresTestCaseRepository(opts),
        testRuns: new PostgresTestRunRepository(opts),
        executions: new PostgresExecutionRepository(opts),
        attachments: new PostgresAttachmentRepository(opts),
        defects: new PostgresDefectRepository(opts),
        preconditions: new PostgresPreconditionRepository(opts),
        tcPreconditions: new PostgresTcPreconditionsRepository(opts),
        projectSequences: new PostgresProjectSequenceRepository(opts),
        jiraConfigs: new PostgresJiraConfigsRepository(opts),
        jiraUserConfigs: new PostgresJiraUserConfigsRepository(opts),
    };
}

function createSupabaseRepositories() {
    const base = new SupabaseBaseRepository({ client: getSupabaseClient() });
    const opts = { base };
    return {
        impl: 'supabase',
        users: new SupabaseUserRepository(opts),
        usersPermissions: new SupabaseUserPermissionsRepository(opts),
        projectUsers: new SupabaseProjectUsersRepository(opts),
        projects: new SupabaseProjectRepository(opts),
        useCases: new SupabaseUseCaseRepository(opts),
        userStories: new SupabaseUserStoryRepository(opts),
        scenarios: new SupabaseScenarioRepository(opts),
        inconsistencias: new SupabaseInconsistenciaRepository(opts),
        testSuites: new SupabaseTestSuiteRepository(opts),
        testCases: new SupabaseTestCaseRepository(opts),
        testRuns: new SupabaseTestRunRepository(opts),
        executions: new SupabaseExecutionRepository(opts),
        attachments: new SupabaseAttachmentRepository(opts),
        defects: new SupabaseDefectRepository(opts),
        preconditions: new SupabasePreconditionRepository(opts),
        tcPreconditions: new SupabaseTcPreconditionsRepository(opts),
        projectSequences: new SupabaseProjectSequenceRepository(opts),
        jiraConfigs: new SupabaseJiraConfigsRepository(opts),
        jiraUserConfigs: new SupabaseJiraUserConfigsRepository(opts),
    };
}

function createRepositories() {
    const implName = (process.env.DB_IMPL || 'supabase').toLowerCase();
    if (implName === 'supabase') return createSupabaseRepositories();
    return createPostgresRepositories();
}

const repositories = createRepositories();

module.exports = Object.freeze(Object.assign(repositories, { createRepositories }));
