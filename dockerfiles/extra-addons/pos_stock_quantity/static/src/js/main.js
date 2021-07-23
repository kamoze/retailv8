/*
* @Author: D.Jane
* @Email: jane.odoo.sp@gmail.com
*/
openerp.pos_stock_quantity = function (instance) {
    instance.pos_stock_quantity = {};

    var module = instance.pos_stock_quantity;

    module.load_fields = function (model_name, fields) {
        if (!(fields instanceof Array)) {
            fields = [fields];
        }

        var models = instance.point_of_sale.PosModel.prototype.models;
        for (var i = 0; i < models.length; i++) {
            var model = models[i];
            if (model.model === model_name) {
                // if 'fields' is empty all fields are loaded, so we do not need
                // to modify the array
                if ((model.fields instanceof Array) && model.fields.length > 0) {
                    model.fields = model.fields.concat(fields || []);
                }
            }
        }
    };

    // init
    popup(instance, module);
    pos_stock(instance, module);
};