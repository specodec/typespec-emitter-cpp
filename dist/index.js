import { emitFile, } from "@typespec/compiler";
import { collectServices, extractFields, scalarName, isArrayType, isRecordType, isModelType, arrayElementType, recordElementType, toPascalCase, toSnakeCase, checkAndReportReservedKeywords, } from "@specodec/typespec-emitter-core";
function typeToCpp(type) {
    if (isArrayType(type))
        return `std::vector<${typeToCpp(arrayElementType(type))}>`;
    if (isRecordType(type))
        return `std::map<std::string, ${typeToCpp(recordElementType(type))}>`;
    const n = scalarName(type);
    if (n) {
        switch (n) {
            case "string": return "std::string";
            case "boolean": return "bool";
            case "int8": return "std::int8_t";
            case "int16": return "std::int16_t";
            case "int32":
            case "integer": return "std::int32_t";
            case "int64": return "std::int64_t";
            case "uint8": return "std::uint8_t";
            case "uint16": return "std::uint16_t";
            case "uint32": return "std::uint32_t";
            case "uint64": return "std::uint64_t";
            case "float32": return "float";
            case "float64":
            case "float":
            case "decimal": return "double";
            case "float64":
            case "float":
            case "decimal": return "double";
            case "bytes": return "std::vector<std::uint8_t>";
        }
    }
    if (type.kind === "Model")
        return type.name || "void";
    return "void";
}
function defaultValue(type) {
    if (isArrayType(type))
        return "{}";
    if (isRecordType(type))
        return "{}";
    const n = scalarName(type);
    if (n) {
        switch (n) {
            case "string": return '""';
            case "boolean": return "false";
            case "int8":
            case "int16":
            case "int32":
            case "integer": return "0";
            case "int64": return "0LL";
            case "uint8":
            case "uint16":
            case "uint32": return "0u";
            case "uint64": return "0ULL";
            case "float32": return "0.0f";
            case "float64":
            case "float":
            case "decimal": return "0.0";
            case "bytes": return "{}";
        }
    }
    return "{}";
}
function writeExpr(expr, type, w) {
    if (isArrayType(type)) {
        const elem = arrayElementType(type);
        return [
            `\n        ${w}.beginArray(${expr}.size());`,
            `for (const auto& _e : ${expr}) { ${w}.nextElement(); ${writeExpr("_e", elem, w)} }`,
            `${w}.endArray()`,
        ].join("\n        ");
    }
    if (isRecordType(type)) {
        const elem = recordElementType(type);
        return [
            `\n        ${w}.beginObject(${expr}.size());`,
            `for (const auto& [_k, _v] : ${expr}) { ${w}.writeField(_k); ${writeExpr("_v", elem, w)} }`,
            `${w}.endObject()`,
        ].join("\n        ");
    }
    if (isRecordType(type)) {
        const elem = recordElementType(type);
        return [
            `${w}.beginObject(${expr}.size())`,
            `for (const auto& [_k, _v] : ${expr}) { ${w}.writeField(_k); ${writeExpr("_v", elem, w)} }`,
            `${w}.endObject()`,
        ].join("\n        ");
    }
    const n = scalarName(type);
    if (n) {
        switch (n) {
            case "string": return `${w}.writeString(${expr});`;
            case "boolean": return `${w}.writeBool(${expr});`;
            case "int8":
            case "int16": return `${w}.writeInt32(static_cast<std::int32_t>(${expr}));`;
            case "int32":
            case "integer": return `${w}.writeInt32(${expr});`;
            case "int64": return `${w}.writeInt64(${expr});`;
            case "uint8":
            case "uint16": return `${w}.writeUint32(static_cast<std::uint32_t>(${expr}));`;
            case "uint32": return `${w}.writeUint32(${expr});`;
            case "uint64": return `${w}.writeUint64(${expr});`;
            case "float32": return `${w}.writeFloat32(${expr});`;
            case "float64":
            case "float":
            case "decimal": return `${w}.writeFloat64(${expr});`;
            case "bytes": return `${w}.writeBytes(${expr});`;
        }
    }
    if (type.kind === "Model" && type.name)
        return `_write${type.name}(${w}, ${expr});`;
    return `// TODO: unknown type`;
}
function readExpr(type, r, optional) {
    if (isArrayType(type)) {
        const elem = arrayElementType(type);
        const cppFull = typeToCpp(type);
        return [
            `[&]() {`,
            `    ${cppFull} _list;`,
            `    ${r}.beginArray();`,
            `    while (${r}.hasNextElement()) { _list.push_back(${readExpr(elem, r)}); }`,
            `    ${r}.endArray();`,
            `    return _list;`,
            `}()`
        ].join("\n");
    }
    if (isRecordType(type)) {
        const elem = recordElementType(type);
        const cppFull = typeToCpp(type);
        return [
            `[&]() {`,
            `    ${cppFull} _map;`,
            `    ${r}.beginObject();`,
            `    while (${r}.hasNextField()) { auto _k = ${r}.readFieldName(); _map[_k] = ${readExpr(elem, r)}; }`,
            `    ${r}.endObject();`,
            `    return _map;`,
            `}()`
        ].join("\n");
    }
    const n = scalarName(type);
    if (n) {
        switch (n) {
            case "string": return `${r}.readString()`;
            case "boolean": return `${r}.readBool()`;
            case "int8": return `static_cast<std::int8_t>(${r}.readInt32())`;
            case "int16": return `static_cast<std::int16_t>(${r}.readInt32())`;
            case "int32":
            case "integer": return `${r}.readInt32()`;
            case "int64": return `${r}.readInt64()`;
            case "uint8": return `static_cast<std::uint8_t>(${r}.readUint32())`;
            case "uint16": return `static_cast<std::uint16_t>(${r}.readUint32())`;
            case "uint32": return `${r}.readUint32()`;
            case "uint64": return `${r}.readUint64()`;
            case "float32": return `${r}.readFloat32()`;
            case "float64":
            case "float":
            case "decimal": return `${r}.readFloat64()`;
            case "bytes": return `${r}.readBytes()`;
        }
    }
    if (type.kind === "Model" && type.name) {
        const decodeCall = `${type.name}Codec.decode(${r})`;
        if (optional)
            return `(${r}.isNull() ? (${r}.readNull(), std::optional<${type.name}>{std::nullopt}) : std::optional<${type.name}>{${decodeCall}})`;
        return decodeCall;
    }
    return `/* TODO */`;
}
function isSelfReferencing(type, parentName) {
    return type.kind === "Model" && type.name === parentName;
}
function optionalWrapType(type, parentName) {
    if (isSelfReferencing(type, parentName)) {
        return `std::shared_ptr<${typeToCpp(type)}>`;
    }
    return `std::optional<${typeToCpp(type)}>`;
}
function generateModelCode(m, pkg) {
    const fields = extractFields(m);
    const optionalFields = fields.filter(f => f.optional);
    const requiredFields = fields.filter(f => !f.optional);
    const lines = [];
    if (fields.length === 0) {
        lines.push(`export struct ${m.name} {};`);
    }
    else {
        lines.push(`export struct ${m.name} {`);
        for (const f of fields) {
            if (f.optional) {
                lines.push(`    ${optionalWrapType(f.type, m.name)} ${f.name};`);
            }
            else {
                lines.push(`    ${typeToCpp(f.type)} ${f.name};`);
            }
        }
        lines.push(`};`);
    }
    lines.push(``);
    lines.push(`export inline void _write${m.name}(SpecWriter& w, const ${m.name}& obj) {`);
    if (optionalFields.length > 0) {
        lines.push(`    int _n = ${requiredFields.length};`);
        for (const f of optionalFields) {
            const isSelfRef = isSelfReferencing(f.type, m.name);
            lines.push(`    if (obj.${f.name}${isSelfRef ? ' != nullptr' : '.has_value()'}) _n++;`);
        }
        lines.push(`    w.beginObject(_n);`);
    }
    else {
        lines.push(`    w.beginObject(${fields.length});`);
    }
    for (const f of fields) {
        if (f.optional) {
            const isSelfRef = isSelfReferencing(f.type, m.name);
            if (isSelfRef) {
                lines.push(`    if (obj.${f.name} != nullptr) { w.writeField("${f.name}"); ${writeExpr(`*obj.${f.name}`, f.type, "w")}; }`);
            }
            else {
                lines.push(`    if (obj.${f.name}.has_value()) { w.writeField("${f.name}"); ${writeExpr(`obj.${f.name}.value()`, f.type, "w")}; }`);
            }
        }
        else {
            lines.push(`    w.writeField("${f.name}"); ${writeExpr(`obj.${f.name}`, f.type, "w")};`);
        }
    }
    lines.push(`    w.endObject();`);
    lines.push(`}`);
    lines.push(``);
    lines.push(`export inline SpecCodec<${m.name}> ${m.name}Codec = {`);
    lines.push(`    .encode = [](SpecWriter& w, const ${m.name}& obj) { _write${m.name}(w, obj); },`);
    lines.push(`    .decode = [](SpecReader& r) -> ${m.name} {`);
    for (const f of fields) {
        if (f.optional) {
            const isSelfRef = isSelfReferencing(f.type, m.name);
            if (isSelfRef) {
                lines.push(`        std::shared_ptr<${typeToCpp(f.type)}> _${f.name};`);
            }
            else {
                lines.push(`        std::optional<${typeToCpp(f.type)}> _${f.name};`);
            }
        }
        else if (isModelType(f.type)) {
            lines.push(`        ${typeToCpp(f.type)} _${f.name} = {};`);
        }
        else {
            lines.push(`        ${typeToCpp(f.type)} _${f.name} = ${defaultValue(f.type)};`);
        }
    }
    lines.push(`        r.beginObject();`);
    lines.push(`        while (r.hasNextField()) {`);
    lines.push(`            auto _fn = r.readFieldName();`);
    for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const prefix = i === 0 ? 'if' : 'else if';
        if (f.optional) {
            const isSelfRef = isSelfReferencing(f.type, m.name);
            if (isSelfRef) {
                lines.push(`            ${prefix} (_fn == "${f.name}") { auto _opt = ${readExpr(f.type, "r", true)}; _${f.name} = _opt ? std::make_shared<${typeToCpp(f.type)}>(*_opt) : nullptr; }`);
            }
            else {
                lines.push(`            ${prefix} (_fn == "${f.name}") { _${f.name} = std::optional<${typeToCpp(f.type)}>{${readExpr(f.type, "r", true)}}; }`);
            }
        }
        else {
            lines.push(`            ${prefix} (_fn == "${f.name}") { _${f.name} = ${readExpr(f.type, "r")}; }`);
        }
    }
    if (fields.length > 0) {
        lines.push(`            else { r.skip(); }`);
    }
    lines.push(`        }`);
    lines.push(`        r.endObject();`);
    const ctorArgs = fields.map(f => {
        if (f.optional || isModelType(f.type))
            return `_${f.name}`;
        return `_${f.name}`;
    }).join(", ");
    lines.push(`        return ${m.name}{${ctorArgs}};`);
    lines.push(`    }`);
    lines.push(`};`);
    return lines.join("\n");
}
export async function $onEmit(context) {
    const program = context.program;
    const outputDir = context.emitterOutputDir;
    const ignoreReservedKeywords = context.options["ignore-reserved-keywords"] ?? false;
    const services = collectServices(program);
    if (checkAndReportReservedKeywords(program, services, ignoreReservedKeywords))
        return;
    for (const svc of services) {
        const pkg = toSnakeCase(svc.namespace.name || "globalnamespace").replace(/_/g, "").toLowerCase();
        const lines = [];
        lines.push("// Generated by @specodec/typespec-emitter-cpp. DO NOT EDIT.");
        lines.push(`export module ${pkg};`);
        lines.push(`import std;`);
        lines.push(`import specodec;`);
        lines.push(``);
        lines.push(`using namespace specodec;`);
        lines.push(``);
        lines.push(`namespace ${pkg} {`);
        lines.push(``);
        for (const m of svc.models) {
            if (!m.name)
                continue;
            lines.push(generateModelCode(m, pkg));
            lines.push(``);
        }
        lines.push(`} // namespace ${pkg}`);
        const fileName = `${toPascalCase(toSnakeCase(svc.serviceName))}Types.cppm`;
        await emitFile(program, { path: `${outputDir}/${fileName}`, content: lines.join("\n") });
    }
}
