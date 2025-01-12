#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { Parser } = require('node-sql-parser');
const parser = new Parser();
const { camelCase } = require('lodash');

// Register the Handlebars helpers
Handlebars.registerHelper('camelCase', function (value) {
    return camelCase(value);
});
// Register the Handlebars helpers
Handlebars.registerHelper('isNotNull', function (value) {
    return value !== null && value !== undefined;
});
Handlebars.registerHelper('isString', function (value) {
    return typeof value === 'string';
});
Handlebars.registerHelper('isBoolean', function (value) {
    return typeof value === 'boolean';
});
Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
});

// Utility function to load Handlebars templates
function loadTemplate(templateName) {
    const filePath = path.join(__dirname, 'crud-templates', `${templateName}.hbs`);
    return Handlebars.compile(fs.readFileSync(filePath, 'utf-8'));
}

function parseSQLScript(sqlScript) {
    try {
        const ast = parser.astify(sqlScript);
        let createStatement;
        if (Array.isArray(ast) && ast.length > 0) {
            createStatement = ast[0];
            if (createStatement.type !== 'create') {
                throw new Error('Provided SQL is not a CREATE TABLE statement.');
            }
        } else if (ast.type === 'create') {
            createStatement = ast;
        } else {
            throw new Error('Provided SQL is not a CREATE TABLE statement.');
        }

        const tableName = createStatement.table[0].table;

        const columns = createStatement.create_definitions.map((columnDef) => {
            if (columnDef.resource !== 'column') return null;

            const { column, definition, nullable } = columnDef;
            const columnName = column.column;
            const columnType = definition.dataType;
            const length = definition.length ? definition.length.value : null;

            if (!columnType) {
                console.warn(`Missing data type for column: ${columnName}`);
                return null;
            }

            return {
                name: columnName,
                type: mapSQLTypeToTypeScript(columnType, columnName),
                prismaType: mapSQLTypeToPrismaType(columnType, columnName),
                isOptional: nullable ? nullable.null === true : false,
                length: length,
            };
        }).filter(Boolean);

        const relations = createStatement.create_definitions
            .filter((def) => def.constraint_type === 'FOREIGN KEY')
            .map((relationDef) => {
                const relatedModel = convertTableNameToSingularClassName(relationDef.reference_definition.table.table);
                const field = relationDef.definition[0].column;
                const references = relationDef.reference_definition.definition[0].column;

                return {
                    name: convertToCamelCase(field),
                    relatedModel,
                    field,
                    references,
                    onDelete: relationDef.reference_definition.on_delete || 'NoAction',
                    onUpdate: relationDef.reference_definition.on_update || 'NoAction',
                };
            });

        const indexes = createStatement.create_definitions
            .filter((def) => def.resource === 'index')
            .map((indexDef) => {
                const fields = indexDef.definition.map((def) => def.column).join(', ');
                return {
                    fields,
                    name: indexDef.index,
                };
            });

        return {
            tableName,
            columns,
            relations,
            indexes,
        };
    } catch (err) {
        console.error('Failed to parse SQL script:', err.message);
        throw err;
    }
}

// Helper functions for class names, file names, and type conversions
function convertTableNameToSingularClassName(tableName) {
    let singularName = tableName;
    // if (tableName.endsWith('es')) {
    //     singularName = tableName.slice(0, -2);
    // } else if (tableName.endsWith('s')) {
    //     singularName = tableName.slice(0, -1);
    // }
    if (tableName.endsWith('s')) {
        singularName = tableName.slice(0, -1);
    }
    return singularName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

function convertTableNameToPluralClassName(tableName) {
    return tableName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

function convertToDashedFileName(name) {
    return name.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/_/g, '-').toLowerCase();
}

// Mapping SQL types to TypeScript types for DTO generation
function mapSQLTypeToTypeScript(sqlType) {
    switch (sqlType.toLowerCase()) {
        case 'varchar':
        case 'text':
        case 'char':
            return 'string';
        case 'int':
        case 'integer':
        case 'decimal':
        case 'float':
        case 'double':
            return 'number';
        case 'datetime':
        case 'timestamp':
            return 'Date';
        case 'tinyint':
            return 'boolean';
        default:
            return 'any';
    }
}

// Mapping SQL types to Prisma types for model generation
function mapSQLTypeToPrismaType(sqlType, columnName) {
    if (!sqlType) {
        console.warn(`Unrecognized SQL type for column "${columnName}": ${sqlType}. Defaulting to String.`);
        return 'String';
    }
    switch (sqlType.toLowerCase()) {
        case 'varchar':
        case 'text':
        case 'char':
            return 'String';
        case 'int':
        case 'integer':
            return 'Int';
        case 'decimal':
            return 'Decimal';
        case 'float':
        case 'double':
            return 'Float';
        case 'datetime':
        case 'timestamp':
            return 'DateTime';
        case 'tinyint':
            return 'Boolean';
        default:
            console.warn(`Unrecognized SQL type for column "${columnName}": ${sqlType}. Defaulting to String.`);
            return 'String';
    }
}

// Load all templates
const dtoTemplate = loadTemplate('dto');
const controllerTemplate = loadTemplate('controller');
const handlerTemplate = loadTemplate('handler');
const dbServiceTemplate = loadTemplate('dbservice');
const responseTemplate = loadTemplate('response');
const listResponseTemplate = loadTemplate('listresponse');
const notFoundErrorTemplate = loadTemplate('notfound-error');
const requestTemplate = loadTemplate('request');
const prismaModelTemplate = loadTemplate('prisma-model');
const constantsTemplate = loadTemplate('constants');
const moduleTemplate = loadTemplate('module');

// Determine the SQL script path
const defaultFilePath = path.join(__dirname, './generate-crud.sql');
const sqlScriptPath = process.argv[2] || defaultFilePath;

let sqlScript;
try {
    sqlScript = fs.readFileSync(sqlScriptPath, 'utf-8');
} catch (error) {
    console.error('Error reading SQL script file:', error.message);
    process.exit(1);
}

try {
    if (!fs.existsSync('output')) {
        fs.mkdirSync('output');
        fs.mkdirSync('output/config');
        fs.mkdirSync('output/controllers');
        fs.mkdirSync('output/data');
        fs.mkdirSync('output/dtos');
        fs.mkdirSync('output/http');
        fs.mkdirSync('output/exceptions');
        fs.mkdirSync('output/http/requests');
        fs.mkdirSync('output/http/responses');
        fs.mkdirSync('output/handlers');
    }

    // Parse the SQL string
    const tableDefinition = parseSQLScript(sqlScript);
    generatePrismaModel(tableDefinition);

    // Prepare singular and plural names
    const singularClassName = convertTableNameToSingularClassName(tableDefinition.tableName);
    const pluralClassName = convertTableNameToPluralClassName(tableDefinition.tableName);

    // Create dashed filenames
    const singularFileName = convertToDashedFileName(singularClassName);
    const pluralFileName = convertToDashedFileName(pluralClassName);

    // Define meta fields to ignore in the DTO
    const metaFields = ['createdOn', 'updatedOn', 'deletedOn', 'createdBy', 'updatedBy', 'deletedBy'];

    // Filter out meta fields for the DTO columns
    const filteredColumns = tableDefinition.columns.filter(column => !metaFields.includes(column.name));

    // Generate DTO file
    fs.writeFileSync(`output/dtos/${singularFileName}.dto.ts`, dtoTemplate({
        className: `${singularClassName}Dto`,
        columns: filteredColumns.map((col) => ({
            name: col.name,
            type: col.type // Uses TypeScript-friendly type mappings
        })),
    }));

    // Generate handler file
    fs.writeFileSync(`output/handlers/${pluralFileName}.handler.ts`, handlerTemplate({
        className: `${pluralClassName}Handler`,
        dbServiceClassName: `${pluralClassName}DbService`,
        dtoClassName: `${singularClassName}Dto`,
        dashedFileName: singularFileName,
        dashedFileNamePlural: pluralFileName,
    }));

    // Generate controller file
    fs.writeFileSync(`output/controllers/${pluralFileName}.controller.ts`, controllerTemplate({
        className: `${pluralClassName}Controller`,
        handlerClassName: `${pluralClassName}Handler`,
        requestClassName: `${singularClassName}Request`,
        dtoClassName: `${singularClassName}Dto`,
        responseClassName: `${singularClassName}Response`,
        listResponseClassName: `${pluralClassName}ListResponse`,
        dashedFileName: singularFileName,
        dashedFileNamePlural: pluralFileName,
        tableName: pluralClassName.toLowerCase(),
    }));

    // Generate DB service file
    fs.writeFileSync(`output/data/${pluralFileName}-db.service.ts`, dbServiceTemplate({
        className: `${pluralClassName}DbService`,
        dtoClassName: `${singularClassName}Dto`,
        notFoundErrorClassName: `${singularClassName}NotFoundError`,
        dashedFileName: singularFileName,
        dashedFileNamePlural: pluralFileName,
        pluralClassName: pluralClassName
    }));

    // Generate response file
    fs.writeFileSync(`output/http/responses/${singularFileName}.response.ts`, responseTemplate({
        className: `${singularClassName}Response`,
        dtoClassName: `${singularClassName}Dto`,
        dashedFileName: singularFileName,
    }));

    // Generate list response file
    fs.writeFileSync(`output/http/responses/${pluralFileName}-list.response.ts`, listResponseTemplate({
        className: `${pluralClassName}ListResponse`,
        responseDtoClassName: `${singularClassName}Dto`,
        dashedFileName: singularFileName,
        dashedFileNamePlural: pluralFileName,
    }));

    // Generate Not Found Error file
    fs.writeFileSync(`output/exceptions/${singularFileName}-not-found-error.ts`, notFoundErrorTemplate({
        className: `${singularClassName}`,
        lowerCaseClassName: singularFileName,
        upperCaseClassName: singularClassName.toUpperCase(),
    }));

    // Generate constants file
    fs.writeFileSync(`output/config/constants.ts`, constantsTemplate({
        upperCaseClassName: singularClassName.toUpperCase(),
    }));

    // Generate module file
    fs.writeFileSync(`output/${pluralFileName}.module.ts`, moduleTemplate({
        pluralClassName: pluralClassName,
        dashedFileNamePlural: pluralFileName,
    }));

    // Generate request file
    fs.writeFileSync(`output/http/requests/${singularFileName}.request.ts`, requestTemplate({
        className: `${singularClassName}Request`,
        columns: filteredColumns.map((col) => ({
            name: col.name,
            type: col.type // Uses TypeScript-friendly type mappings
        })),
        dashedFileName: singularFileName,
    }));

    console.log('CRUD classes and Prisma model have been generated successfully.');
} catch (error) {
    console.error('Failed to generate CRUD classes or Prisma model:', error.message);
}

// Add this function to generate Prisma model
function generatePrismaModel(tableDefinition) {
    const prismaModelTemplate = loadTemplate('prisma-model');

    // Filter out duplicate columns
    const uniqueColumns = tableDefinition.columns.reduce((acc, column) => {
        if (!acc.find(col => col.name === column.name)) {
            acc.push(column);
        }
        return acc;
    }, []);

    // Prepare column data for Prisma template
    const prismaColumns = uniqueColumns.map((column) => {
        let { name, prismaType, length } = column;
        let isId = false;
        let dbSpecific = null;
        let isOptional = column.isOptional;

        switch (name) {
            case 'id':
                isId = true;
                dbSpecific = 'Uuid';
                break;
            case 'createdOn':
            case 'updatedOn':
            case 'deletedOn':
                dbSpecific = 'Timestamp';
                break;
            case 'createdBy':
            case 'updatedBy':
            case 'deletedBy':
                dbSpecific = 'Uuid';
                break;
            case 'priority':
                dbSpecific = 'VarChar(10)';
                break;
            default:
                if (prismaType === 'String' && length) {
                    dbSpecific = `VarChar(${length})`;
                }
                break;
        }

        return {
            name,
            type: prismaType,
            isId,
            isOptional,
            dbSpecific,
            length,
        };
    });

    const prismaModelData = {
        modelName: convertTableNameToPluralClassName(tableDefinition.tableName),
        columns: prismaColumns,
        relations: tableDefinition.relations,
        indexes: tableDefinition.indexes,
    };

    fs.writeFileSync(`output/${convertToDashedFileName(prismaModelData.modelName)}.model.prisma`, prismaModelTemplate(prismaModelData));

    console.log('Prisma model has been generated successfully.');
}