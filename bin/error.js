"use strict";

var Err = CustomError('CustomError');
Err.order = CustomError(Err, { message: 'Arguments out of order.', code: 'EOARG' });

module.exports = CustomError;

/**
 * Create a custom error
 * @param {string} [name] The name to give the error. Defaults to the name of it's parent.
 * @param {function} [parent] The Error or CustomError constructor to inherit from.
 * @param {object} [properties] The default properties for the custom error.
 * @param {function} [factory] A function to call to modify the custom error instance when it is instantiated.
 * @returns {function} that should be used as a constructor.
 */
function CustomError(name, parent, properties, factory) {
    var construct;
    var isRoot;

    // normalize arguments
    parent = findArg(arguments, 1, Error, isParentArg, [isPropertiesArg, isFactoryArg]);
    properties = findArg(arguments, 2, {}, isPropertiesArg, [isFactoryArg]);
    factory = findArg(arguments, 3, noop, isFactoryArg, []);
    name = findArg(arguments, 0, parent === Error ? 'Error' : parent.prototype.CustomError.name, isNameArg, [isParentArg, isPropertiesArg, isFactoryArg]);

    // if this is the root and their is no factory then use the default root factory
    isRoot = parent === Error;
    if (isRoot && factory === noop) factory = rootFactory;

    // build the constructor function
    construct = function(message, configuration) {
        var ar;
        var i;
        var item;
        var props;

        // force this function to be called with the new keyword
        if (!(this instanceof construct)) return new construct(message, configuration);

        // rename the constructor
        delete this.constructor.name;
        Object.defineProperty(this.constructor, 'name', {
            enumerable: false,
            configurable: true,
            value: name,
            writable: false
        });

        // make sure that the message is an object
        if (typeof message === 'string') message = { message: message };
        if (!message) message = {};

        // build the properties object
        ar = this.CustomError.chain.slice(0).reverse().map(function(value) { return value.properties });
        ar.push(message);
        ar.unshift({});
        props = Object.assign.apply(Object, ar);

        // call each factory in the chain, starting at the root
        for (i = this.CustomError.chain.length - 1; i >= 0; i--) {
            item = this.CustomError.chain[i];
            if (item.factory !== noop) {
                item.factory.call(this, props, configuration);
            }
        }
    };

    // cause the function prototype to inherit from parent's prototype
    construct.prototype = Object.create(parent.prototype);
    construct.prototype.constructor = construct;

    // update error name
    construct.prototype.name = name;

    // add details about the custom error to the prototype
    construct.prototype.CustomError = {
        chain: isRoot ? [] : parent.prototype.CustomError.chain.slice(0),
        factory: factory,
        name: name,
        parent: parent,
        properties: properties
    };
    construct.prototype.CustomError.chain.unshift(construct.prototype.CustomError);

    // update the toString method on the prototype to accept a code
    construct.prototype.toString = function() {
        var result = this.CustomError.chain[this.CustomError.chain.length - 1].name;
        if (this.code) result  += ' ' + this.code;
        if (this.message) result += ': ' + this.message;
        return result;
    };

    return construct;
}




function findArg(args, index, defaultValue, filter, antiFilters) {
    var anti = -1;
    var found = -1;
    var i;
    var j;
    var len = index < args.length ? index : args.length;
    var val;

    for (i = 0; i <= len; i++) {
        val = args[i];
        if (anti === -1) {
            for (j = 0; j < antiFilters.length; j++) {
                if (antiFilters[j](val)) anti = i;
            }
        }
        if (found === -1 && filter(val)) {
            found = i;
        }
    }

    if (found !== -1 && anti !== -1 && anti < found) throw new Err.order();
    return found !== -1 ?args[found] : defaultValue;
}

function isFactoryArg(value) {
    return typeof value === 'function' && value !== Error && !value.prototype.CustomError;
}

function isNameArg(value) {
    return typeof value === 'string';
}

function isParentArg(value) {
    return typeof value === 'function' && (value === Error || value.prototype.CustomError);
}

function isPropertiesArg(value) {
    return value && typeof value === 'object';
}

function noop() {}

function rootFactory(properties, configuration) {
    var _this = this;
    var code;
    var config = { stackLength: Error.stackTraceLimit };
    var messageStr = '';
    var originalStackLength = Error.stackTraceLimit;
    var stack;

    // get configuration options
    if (!configuration || typeof configuration !== 'object') configuration = {};
    if (configuration.hasOwnProperty('stackLength') &&
        typeof configuration.stackLength === 'number' &&
        !isNaN(configuration.stackLength) &&
        configuration.stackLength >= 0) config.stackLength = configuration.stackLength;

    // copy properties onto this object
    Object.keys(properties).forEach(function(key) {
        switch(key) {
            case 'code':
                code = properties.code || void 0;
                break;
            case 'message':
                messageStr = properties.message || '';
                break;
            default:
                _this[key] = properties[key];
        }
    });

    // generate the stack trace
    Error.stackTraceLimit = config.stackLength + 2;
    stack = (new Error()).stack.split('\n');
    stack.splice(0, 3);
    stack.unshift('');
    Error.stackTraceLimit = originalStackLength;
    this.stack = stack.join('\n');

    Object.defineProperty(this, 'code', {
        configurable: true,
        enumerable: true,
        get: function() {
            return code;
        },
        set: function(value) {
            code = value;
            updateStack();
        }
    });

    Object.defineProperty(this, 'message', {
        configurable: true,
        enumerable: true,
        get: function() {
            return messageStr;
        },
        set: function(value) {
            messageStr = value;
            updateStack();
        }
    });


    updateStack();

    function updateStack() {
        stack[0] = _this.toString();
        _this.stack = stack.join('\n');
    }
}