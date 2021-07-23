/*
* @Author: D.Jane
* @Email: jane.odoo.sp@gmail.com
*/
function popup(instance, module) {
    var ConfirmPopupWidget = instance.point_of_sale.ConfirmPopupWidget;
    if (!ConfirmPopupWidget) {
        return;
    }
    var Reminder = ConfirmPopupWidget.extend({
        template: 'Reminder',
        init:function(parent,options){
            this._super(parent, options);
            this.options = {};
        },
        show: function(options){
            this.options = options;
            options.cancel = function () {
                options.line.set_quantity('remove');
                this.hide();
            };
            options.confirm = function () {
                options.line.set_quantity(options.max_available);
                this.hide();
            };
            this._super(options);
        }
    });

    instance.point_of_sale.PosWidget.include({
        build_widgets: function () {
            this.reminder_popup = new Reminder(this, {});
            this.reminder_popup.appendTo(this.$el);
            this.reminder_popup.hide();
            this._super();
            this.screen_selector.popup_set['reminder'] = this.reminder_popup;
        }
    })
}
