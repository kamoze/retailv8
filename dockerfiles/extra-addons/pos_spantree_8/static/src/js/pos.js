openerp.pos_spantree_8 = function (instance) {
    var _t = instance.web._t;
    var QWeb = instance.web.qweb;
    
    var round_di = instance.web.round_decimals;
    var round_pr = instance.web.round_precision;

    instance.point_of_sale.PosModel = instance.point_of_sale.PosModel.extend({
        _save_to_server: function (orders, options) {
            if (!orders || !orders.length) {
                var result = $.Deferred();
                result.resolve([]);
                return result;
            }
                
            options = options || {};

            var self = this;
            var timeout = typeof options.timeout === 'number' ? options.timeout : 7500 * orders.length;

            // we try to send the order. shadow prevents a spinner if it takes too long. (unless we are sending an invoice,
            // then we want to notify the user that we are waiting on something )
            var posOrderModel = new instance.web.Model('pos.order');
            
            var currentOrder = this.get('selectedOrder');
            var coupon_amt = currentOrder.get_coupon_amount();
            var redeem_point = currentOrder.get_redeem_point();
            var context = {'gift_amount': coupon_amt, 'redeem_point': redeem_point};
            
            return posOrderModel.call('create_from_ui',
                [_.map(orders, function (order) {
                    order.to_invoice = options.to_invoice || false;
                    return order;
                }), context],
                undefined,
                {
                    shadow: !options.to_invoice,
                    timeout: timeout
                }
            ).then(function (server_ids) {
                _.each(orders, function (order) {
                    self.db.remove_order(order.id);
                });
                return server_ids;
            }).fail(function (error, event){
                if(error.code === 200 ){    // Business Logic Error, not a connection problem
                    self.pos_widget.screen_selector.show_popup('error-traceback',{
                        message: error.data.message,
                        comment: error.data.debug
                    });
                }
                // prevent an error popup creation by the rpc failure
                // we want the failure to be silent as we send the orders in the background
                event.preventDefault();
                console.error('Failed to send orders:', orders);
            });
        },
    });

    instance.point_of_sale.ProductScreenWidget = instance.point_of_sale.ProductScreenWidget.extend({
        init: function() {
            this._super.apply(this, arguments);
        },
        start:function(){
            var self = this;

            self.product_list_widget = new instance.point_of_sale.ProductListWidget(this,{
                click_product_action: function(product){
                    if(product.to_weight && self.pos.config.iface_electronic_scale){
                        self.pos_widget.screen_selector.set_current_screen('scale',{product: product});
                    }else{
                        self.pos.get('selectedOrder').addProduct(product);
                    }
                },
                product_list: this.pos.db.get_product_by_category(0)
            });
            self.product_list_widget.replace(this.$('.placeholder-ProductListWidget'));

            this.product_categories_widget = new instance.point_of_sale.ProductCategoriesWidget(this,{
                product_list_widget: this.product_list_widget,
            });
            this.product_categories_widget.replace(this.$('.placeholder-ProductCategoriesWidget'));
            pos = self.pos;
            selectedOrder = self.pos.get('selectedOrder');
            $('#return_order_ref').html('');
            pos = pos;
            
            $("span#return_order").click(function() {
//                var self = this;
                $("span#return_order").css('background', 'blue');
                $("span#sale_mode").css('background', '');
                $("span#missing_return_order").css('background', '');
                selectedOrder = pos.get('selectedOrder');
                dialog = new instance.web.Dialog(this, {
                    title: _t("Return Order"),
                    size: 'medium',
                    buttons: [
                        {text: _t("Validate"), click: function() {
                            var ret_o_ref = dialog.$el.find("input#return_order_number").val();
                            if (ret_o_ref.indexOf('Order') == -1) {
                                ret_o_ref = _t('Order ') + ret_o_ref.toString();
                            }
                            if (ret_o_ref.length > 0) {
                                new instance.web.Model("pos.order").get_func("search_read")
                                            ([['pos_reference', '=', ret_o_ref],['parent_return_order', '=', 0]], 
                                            ['id', 'pos_reference', 'partner_id']).pipe(
                                    function(result) {
                                        if (result && result.length == 1) {
                                            new instance.web.Model("pos.order.line").get_func("search_read")
                                                    ([['order_id', '=', result[0].id],['return_qty', '>', 0]], []).pipe(
                                            function(res) {
                                                if (res) {
                                                    products = [];
                                                    _.each(res,function(r) {
                                                        product = pos.db.get_product_by_id(r.product_id[0]);
                                                        products.push(product)
                                                    });
                                                    self.product_list_widget.set_product_list(products);
                                                }
                                            });
                                            selectedOrder.set_ret_o_id(result[0].id);
                                            selectedOrder.set_ret_o_ref(result[0].pos_reference);
                                            $('#return_order_ref').html(result[0].pos_reference);
                                            if (result[0].partner_id) {
                                                var partner = pos.db.get_partner_by_id(result[0].partner_id[0]);
                                                selectedOrder.set_client(partner);
                                            }
                                        } else {
                                            var error_str = _t('Please enter correct reference number !');
                                            var error_dialog = new instance.web.Dialog(this, { 
                                                width: 'medium',
                                                buttons: [{text: _t("Close"), click: function() { this.parents('.modal').modal('hide'); }}],
                                            }).open();
                                            error_dialog.$el.append(
                                                '<span id="error_str" style="font-size:16px;">' + error_str + '</span>');
                                        }
                                    }
                                );
                                this.parents('.modal').modal('hide');
                            } else {
                                var error_str =_t('Please enter correct reference number !');
                                var error_dialog = new instance.web.Dialog(this, { 
                                    width: 'medium',
                                    buttons: [{text: _t("Close"), click: function() { this.parents('.modal').modal('hide'); }}],
                                }).open();
                                error_dialog.$el.append(
                                    '<span id="error_str" style="font-size:18px;">' + error_str + '</span>');
                            }
                        }},
                        {text: _t("Cancel"), click: function() { 
                            $("span#return_order").css('background', '');
                            $("span#sale_mode").css('background', 'blue');
                            $("span#missing_return_order").css('background', '');
                            this.parents('.modal').modal('hide'); 
                        }}
                    ]
                }).open();
                dialog.$el.html(QWeb.render("pos-return-order", self));
                dialog.$el.find("input#return_order_number").focus();
            });
            
            $("span#sale_mode").click(function(event) {
                var selectedOrder = pos.get('selectedOrder');
                var id = $(event.target).data("category-id");
                selectedOrder.set_ret_o_id('');
                var category = pos.db.get_category_by_id(id);
                self.product_categories_widget.set_category(category);
                self.product_categories_widget.renderElement();
                
                $("span#sale_mode").css('background', 'blue');
                $("span#return_order").css('background', '');
                $("span#missing_return_order").css('background', '');
                selectedOrder.set_ret_o_ref('');
                $('#return_order_ref').html('');
            });
            
            $("span#missing_return_order").click(function(event) {
                var selectedOrder = pos.get('selectedOrder');
                var id = $(event.target).data("category-id");
                selectedOrder.set_ret_o_id('Missing Receipt');
                var category = pos.db.get_category_by_id(id);
                self.product_categories_widget.set_category(category);
                self.product_categories_widget.renderElement();
                
                $("span#sale_mode").css('background', '');
                $("span#return_order").css('background', '');
                $("span#missing_return_order").css('background', 'blue');
                selectedOrder.set_ret_o_ref('Missing Receipt');
                $('#return_order_ref').html('Missing Receipt');
            });
            
            var fetch = function(model, fields, domain, ctx){
                this._load_progress = (this._load_progress || 0) + 0.05; 
                self.pos_widget.loading_message(_t('Loading')+' '+model,this._load_progress);
                return new instance.web.Model(model).query(fields).filter(domain).context(ctx).all()
            }
            
            $("#create_coupon").click(function() {
                selectedOrder = pos.get('selectedOrder');
                if (!selectedOrder.get_coupon_id()) {
                    dialog = new instance.web.Dialog(this, {
                        title: _t("Create Coupon"),
                        size: 'medium',
                        buttons: [
                            {text: _t("Create"), click: function() {
                                var coupon_name = dialog.$el.find("input#coupon_name").val();
                                var coupon_validity = dialog.$el.find("input#coupon_validity").val();
                                var coupon_date_create = dialog.$el.find("input#coupon_issue_date").val();
                                if (!($.isNumeric(coupon_validity) && parseInt(coupon_validity, 10) > 0)) {
                                    alert('Please enter numbers for validity !');
                                    return;
                                }
                                
                                var DatePattern = /^\d{4}-\d{1,2}-\d{1,2}$/; //Declare Regex
                                var dtArray = coupon_date_create.match(DatePattern); // is format OK?
                                if (dtArray == null) {
                                    alert ('Date format is invalid !');
                                    dialog.$el.find("input#coupon_issue_date").val('');
                                    return false;
                                }
                                
                                if (coupon_name && coupon_validity && coupon_date_create) {
                                    new instance.web.Model("pos.coupon").get_func("create")
                                        ({
                                            'name': coupon_name,
                                            'validity':coupon_validity, 
                                            'date_create': coupon_date_create, 
                                        }).pipe(function(result) {
                                            if (result) {
                                                selectedOrder.set_coupon(coupon_name);
                                                selectedOrder.set_coupon_id(result);
                                                $('span#coupon_name').html('Coupon Created');
                                            }
                                        });
                                    this.parents('.modal').modal('hide');
                                    
                                    var products1 = fetch(
                                        'product.product', 
                                        ['id', 'name', 'list_price','price','pos_categ_id','product_brand_id','product_season_id', 'categ_id', 'taxes_id', 'ean13', 'default_code', 
                                        'qty_available', 'disc_price', 'description_sale', 'uom_id', 'uos_id', 'uos_coeff', 'mes_type', 'description', 'variants', 'is_coupon', 'is_card'],
                                        [['is_coupon','=',true],['available_in_pos','=',true]],
                                        {pricelist: pos.pricelist.id} // context for price
                                    ).then(function(products1){
                                        products = [];
                                        _.each(products1,function(r) {
                                            product = pos.db.get_product_by_id(r.id);
                                            products.push(product)
                                        });
                                        self.product_list_widget.set_product_list(products);
                                    });
                                } else {
                                    alert ("Please enter all values !");
                                }
                            }},
                            {text: _t("Cancel"), click: function() { this.parents('.modal').modal('hide'); }}
                        ]
                    }).open();
                    dialog.$el.html(QWeb.render("pos-create-coupon", self));
                    dialog.$el.find("input#coupon_name").focus();
                    d = new Date()
                    m = d.getMonth()+1;
                    dt = d.getDate();
                    yr = d.getFullYear();
                    cur_date = yr.toString() + '-' + m.toString() + '-' + dt.toString();
                    dialog.$el.find("input#coupon_issue_date").val(cur_date);
                } else {
                    alert ('Coupon is already created !');
                }
            });
        },
    });
    
    instance.point_of_sale.PaymentScreenWidget = instance.point_of_sale.PaymentScreenWidget.extend({
        show: function(){
            this._super();
            var self = this;
            
            var currentOrder = pos.get('selectedOrder');
            var due_total = currentOrder.getTotalTaxIncluded();
            pos = self.pos;
            pos_widget = self.pos_widget;
            
            $('table').delegate('img[id=remove_serial]', 'click', function() {
                var $this = $(this);
                var tr_id = $this.closest('tr').attr('id');
                id = tr_id.split('_');
                id = id[2];
                var coupon_amt = parseFloat($('#gift_coupon_input_coupon_amount_' + id.toString()).html());
                if (coupon_amt) {
                    currentOrder.set_coupon_amount(parseFloat(currentOrder.get_coupon_amount()) - coupon_amt);
                }
                $this.closest('tr').remove();
                self.update_payment_summary();
            });
            
            // Gift Coupon Updated
                
            var gift_click_count = 0;
            $('#add_gift_coupon').click(function() {
                var connection = false;
                new instance.web.Model("pos.order").get_func("check_connection")().done(function(result) {
                    if (result) {
                        dialog = new instance.web.Dialog(this, {
                            title: _t("Enter gift coupon information"),
                            width: 380,
                            height: 210,
                            buttons: [
                                {text: _t("Ok"), click: function() {
                                    var gift_coupon_serial = dialog.$el.find("input#gift_coupon_barcode_pay").val();
                                    if (gift_coupon_serial) {
                                        var today = new Date();
                                        var dd = (today.getDate()).toString();
                                        var mm = (today.getMonth()+1).toString();
                                        var yyyy = today.getFullYear().toString();
                                        new instance.web.Model("pos.coupon.line").get_func("search_read")([['name', '=', gift_coupon_serial], 
                                                                                    ['date_expiry_line', '>', yyyy + '-' + mm + '-' + dd]], 
                                                                                    ['id','amount','remaining_amt']).pipe(
                                            function(result) {
                                                if (result && result[0]) {
                                                    if (result[0].remaining_amt > 0) {
                                                        if (due_total >= result[0].remaining_amt) {
                                                            gift_click_count = gift_click_count + 1;
                                                            var table = $('#pay_by_coupon_table');
                                                            table.append("<tr id='gift_rettr_" + gift_click_count.toString() + "'><td style='text-align:right;padding-right:15px;width:80%;'>" +
                                                            "<span id='gift_coupon_" + gift_click_count.toString() + "' class='gift_coupon_serial_input' style='font-weight:bold;width:30px;padding:0 5px;'/></td>" +
                                                            "<td style='text-align:right;padding-right:15px;width:20%;'>" +
                                                            "<span id='gift_coupon_input_coupon_amount_" + gift_click_count.toString() + "' class='gift_coupon_amount_input' " +
                                                            "style='width:30px;padding:0 5px;font-weight:bold;'/></td><td style='padding:5px;'>" +
                                                            "<a href='javascript:void(0)' class='delete-payment-line'>" +
                                                            "<img src='/point_of_sale/static/src/img/search_reset.gif' id='remove_serial'></a>" +
                                                            "</td></tr>");
                                                            
                                                            $('span#gift_coupon_' + gift_click_count.toString()).html(gift_coupon_serial);
                                                            $('span#gift_coupon_input_coupon_amount_' + gift_click_count.toString()).html(result[0].remaining_amt);
                                                            currentOrder.set_coupon_amount(parseFloat(currentOrder.get_coupon_amount()) + parseFloat(result[0].remaining_amt));
                                                        } else if (due_total < result[0].remaining_amt) {
                                                            gift_click_count = gift_click_count + 1;
                                                            var table = $('#pay_by_coupon_table');
                                                            table.append("<tr id='gift_rettr_" + gift_click_count.toString() + "'><td style='text-align:right;padding-right:15px;width:80%;'>" +
                                                            "<span id='gift_coupon_" + gift_click_count.toString() + "' class='gift_coupon_serial_input' style='font-weight:bold;width:30px;padding:0 5px;'/></td>" +
                                                            "<td style='text-align:right;padding-right:15px;width:20%;'>" +
                                                            "<span id='gift_coupon_input_coupon_amount_" + gift_click_count.toString() + "' class='gift_coupon_amount_input' " +
                                                            "style='width:30px;padding:0 5px;font-weight:bold;'/></td><td style='padding:5px;'>" +
                                                            "<a href='javascript:void(0)' class='delete-payment-line'>" +
                                                            "<img src='/point_of_sale/static/src/img/search_reset.gif' id='remove_serial'></a>" +
                                                            "</td></tr>");
                                                            
                                                            $('span#gift_coupon_' + gift_click_count.toString()).html(gift_coupon_serial);
                                                            $('span#gift_coupon_input_coupon_amount_' + gift_click_count.toString()).html(due_total);
                                                            currentOrder.set_coupon_amount(parseFloat(currentOrder.get_coupon_amount()) + parseFloat(due_total));
                                                        }
                                                    } else {
                                                        dialog.$el.find("input#gift_coupon_barcode_pay").val('');
                                                        alert (_t('Amount should be greater than zero !'));
                                                    }
                                                } else {
                                                    dialog.$el.find("input#gift_coupon_barcode_pay").val('');
                                                    dialog.$el.find("input#gift_coupon_barcode_amt").val('');
                                                    alert (_t('Either date is expired or invalid barcode.'))
                                                }self.update_payment_summary();
                                            }
                                        );
                                    }
                                    this.parents('.modal').modal('hide');
                                }},
                                {text: _t("Cancel"), click: function() { 
                                    this.parents('.modal').modal('hide');
                                }}
                            ]
                        }).open();
                        dialog.$el.html(QWeb.render("pay_gift_coupon_info", this));
                        dialog.$el.find("input#gift_coupon_barcode_pay").focusout(function() {
                            var today = new Date();
                            var dd = (today.getDate()).toString();
                            var mm = (today.getMonth()+1).toString();
                            var yyyy = today.getFullYear().toString();
                            new instance.web.Model("pos.coupon.line").get_func("search_read")([['name', '=', dialog.$el.find("input#gift_coupon_barcode_pay").val()], 
                                                                    ['date_expiry_line', '>', yyyy + '-' + mm + '-' + dd]], 
                                                                    ['remaining_amt']).pipe(
                                    function(result) {
                                        if (result && result[0]) {
                                            $('#remain_gift_coupon_bal').html(result[0].remaining_amt);
                                        }
                                    }
                            );
                        });
                    }
                }).fail(function(result, ev) {
                    ev.preventDefault();
                    connection = false;
                    return
                });
            });
            
            // Redeem Coupon
                
            $('table').delegate('img[id=remove_redeem]', 'click', function() {
                var $this = $(this);
                var tr_id = $this.closest('tr').attr('id');
                id = tr_id.split('_');
                id = id[2];
                var redeem_amt = parseFloat($('#redeem_coupon_input_coupon_amount').html());
                if (redeem_amt) {
                    currentOrder.set_redeem_point(parseFloat(currentOrder.get_redeem_point()) - redeem_amt);
                }
                $this.closest('tr').remove();
                self.update_payment_summary();
            });
            
            $('#add_redeem_coupon').click(function() {
                var connection = false;
                new instance.web.Model("pos.order").get_func("check_connection")().done(function(result) {
                    if (result) {
                        var client_id = currentOrder.get_client()
                        if (client_id) {
                            new instance.web.Model("res.partner").get_func("search_read")(domain=[['id', '=', client_id.id]], 
                                fields=['id', 'member', 'member_cat_id', 'remain_redeem_points']).pipe(
                                function(result) {
                                    if (result && result[0] && result[0].member) {
                                        if (result[0].member && result[0].member_cat_id[0]) {
                                            new instance.web.Model("member.category").get_func("search_read")(domain=[['id', '=', result[0].member_cat_id[0]]], 
                                                fields=['id', 'enable_redeemtion', 'purchase_limit']).pipe(
                                                function(res) {
                                                    if (res && res[0].enable_redeemtion && res[0].purchase_limit <= currentOrder.getTotalTaxIncluded()) {
                                                        dialog = new instance.web.Dialog(this, {
                                                            title: _t("Enter redeem coupon information"),
                                                            size: 'medium',
                                                            buttons: [
                                                                {text: _t("Ok"), click: function() {
                                                                    var redeem_barcode_amt = dialog.$el.find("input#redeem_barcode_amt").val();
                                                                    if (redeem_barcode_amt > result[0].remain_redeem_points) {
                                                                        alert (_t('You can not use more than available points.'));
                                                                        return;
                                                                    } else if (redeem_barcode_amt > 0) {
                                                                        currentOrder.set_redeem_point(redeem_barcode_amt);
                                                                        new instance.web.Model("res.partner").get_func("point_2_price")(parseInt(client_id.id), parseInt(redeem_barcode_amt)).pipe(
                                                                            function(result) {
                                                                                if (result) {
                                                                                    var table = $('#pay_by_loyalty_table');
                                                                                    table.append("<tr id='redeem_tr'><td style='text-align:right;padding-right:15px;width:80%;'>" +
                                                                                    "<span id='redeem_input' class='redeem_input' style='font-weight:bold;width:30px;padding:0 5px;'/></td>" +
                                                                                    "<td style='text-align:right;padding-right:15px;width:20%;'>" +
                                                                                    "<span id='redeem_coupon_input_coupon_amount' class='redeem_coupon_amount_input' " +
                                                                                    "style='width:30px;padding:0 5px;font-weight:bold;'>"+result+"</span></td><td style='padding:0px 5px 5px 0px;'>" +
                                                                                    "<a href='javascript:void(0)' class='delete-payment-line'>" +
                                                                                    "<img src='/point_of_sale/static/src/img/search_reset.gif' id='remove_redeem'></a>" +
                                                                                    "</td></tr>");
                                                                                } self.update_payment_summary();
                                                                            }
                                                                        ); 
                                                                    }
                                                                this.parents('.modal').modal('hide');
                                                            }},
                                                            {text: _t("Cancel"), click: function() {
                                                                this.parents('.modal').modal('hide');
                                                            }}]
                                                        }).open();
                                                        dialog.$el.html(QWeb.render("pay_redeem_coupon_info", this));
                                                        dialog.$el.find("input#redeem_barcode_amt").focus();
                                                        $('.remain_redeem_input').html(result[0].remain_redeem_points);
                                                    }
                                                });
                                        }
                                    } else {
                                        alert (_t('Either customer is not selected or customer is not a member.'))
                                    }
                                });
                            } else {
                                alert (_t('Customer is not selected.'))
                            }
                        }
                    }).fail(function(result, ev) {
                        ev.preventDefault();
                        connection = false;
                        return
                    });
                }
            );
        },
        update_payment_summary: function() {
            var currentOrder = this.pos.get('selectedOrder');
            var paidTotal = currentOrder.getPaidTotal();
            var dueTotal = currentOrder.getTotalTaxIncluded();
            var remaining = dueTotal > paidTotal ? dueTotal - paidTotal : 0;
            var change = paidTotal > dueTotal ? paidTotal - dueTotal : 0;
            
            var cpn_amt = parseFloat(0.0);

            this.$('.payment-due-total').html(this.format_currency(dueTotal));
            this.$('.payment-paid-total').html(this.format_currency(paidTotal));
            this.$('.payment-remaining').html(this.format_currency(remaining));
            this.$('.payment-change').html(this.format_currency(change));
            
            _.each($('.gift_coupon_amount_input'), function(amt) {
                if (parseFloat($(amt).html()) == '') {
                    val = 0.0
                } else {
                    val = parseFloat($(amt).html());
                }
                cpn_amt += parseFloat(val);
            });
            redeem_amt = parseFloat($('#redeem_coupon_input_coupon_amount').html());
            cpn_amt = parseFloat(cpn_amt);
            if (redeem_amt > 0) {
                cpn_amt = cpn_amt + redeem_amt;
            }
            currentOrder.setCpnAmt(cpn_amt);
            if (cpn_amt > 0 ) {
                var paid_total_cpn = 0.0;
                if(paidTotal) {
                    paid_total_cpn = paidTotal + cpn_amt;
                    remaining = dueTotal > paid_total_cpn ? dueTotal - paid_total_cpn : 0;
                    change = paid_total_cpn > dueTotal ? paid_total_cpn - dueTotal : 0;
                } else {
                    remaining = dueTotal > cpn_amt ? dueTotal - cpn_amt : 0;
                    change = cpn_amt > dueTotal ? cpn_amt - dueTotal : 0;
                    paid_total_cpn = cpn_amt;
                }
                $('.payment-due-total').html(this.format_currency(dueTotal));
                $('.payment-paid-total').html(this.format_currency(paid_total_cpn));
                $('.payment-remaining').html(this.format_currency(remaining));
                $('.payment-change').html(this.format_currency(change));
            }
            
            if(currentOrder.selected_orderline === undefined){
                remaining = 1;  // What is this ? 
            }
                
            if(this.pos_widget.action_bar){
                this.pos_widget.action_bar.set_button_disabled('validation', !this.is_paid());
                this.pos_widget.action_bar.set_button_disabled('invoice', !this.is_paid());
            }
        },
        is_paid: function(){
            var currentOrder = this.pos.get('selectedOrder');
            return (currentOrder.getTotalTaxIncluded() < 0.000001 
                   || currentOrder.getPaidTotal() + 0.000001 + currentOrder.getCpnAmt() >= currentOrder.getTotalTaxIncluded());

        },
        validate_order: function(options) {
            var self = this;
            options = options || {};

            var currentOrder = this.pos.get('selectedOrder');
            var coupon_amt = currentOrder.get_coupon_amount();
            var redeem_point = currentOrder.get_redeem_point();
            
            var today = new Date();
            var dd = (today.getDate()).toString();
            var mm = (today.getMonth()+1).toString();
            var yyyy = today.getFullYear().toString();

            if(currentOrder.get('orderLines').models.length === 0){
                this.pos_widget.screen_selector.show_popup('error',{
                    'message': _t('Empty Order'),
                    'comment': _t('There must be at least one product in your order before it can be validated'),
                });
                return;
            }

            var plines = currentOrder.get('paymentLines').models;
            for (var i = 0; i < plines.length; i++) {
                if (plines[i].get_type() === 'bank' && plines[i].get_amount() < 0) {
                    this.pos_widget.screen_selector.show_popup('error',{
                        'message': _t('Negative Bank Payment'),
                        'comment': _t('You cannot have a negative amount in a Bank payment. Use a cash payment method to return money to the customer.'),
                    });
                    return;
                }
            }

            if(!this.is_paid()){
                return;
            }

            // The exact amount must be paid if there is no cash payment method defined.
            if (Math.abs(currentOrder.getTotalTaxIncluded() - currentOrder.getPaidTotal()) > 0.00001) {
                var cash = false;
                for (var i = 0; i < this.pos.cashregisters.length; i++) {
                    cash = cash || (this.pos.cashregisters[i].journal.type === 'cash');
                }
                if (!cash) {
                    this.pos_widget.screen_selector.show_popup('error',{
                        message: _t('Cannot return change without a cash payment method'),
                        comment: _t('There is no cash payment method available in this point of sale to handle the change.\n\n Please pay the exact amount or add a cash payment method in the point of sale configuration'),
                    });
                    return;
                }
            }

            if (this.pos.config.iface_cashdrawer) {
                    this.pos.proxy.open_cashbox();
            }

            if(options.invoice){
                // deactivate the validation button while we try to send the order
                this.pos_widget.action_bar.set_button_disabled('validation',true);
                this.pos_widget.action_bar.set_button_disabled('invoice',true);

                var coupon_id = currentOrder.get_coupon_id();
                var connection = false;
                var context = {};
                new instance.web.Model("pos.order").get_func("check_connection")().done(function(result) {
                    if (result) {
                        if (coupon_id) {
                            new instance.web.Model("pos.coupon").get_func("search_read")
                                                  ([['id', '=', coupon_id]], ['date_create']).pipe(
                                function(result) {
                                    if (result && result[0]) {
                                        if (currentOrder.get('orderLines').length > 0) {
                                            var tr1 = [];
                                            (currentOrder.get('orderLines')).each(_.bind( function(item) {
                                                if (item.get_product().is_coupon) {
                                                    var coupon_serial = currentOrder.generateUniqueId();
                                                    item.set_coupon_serial(coupon_serial);
                                                    if (item.quantity > 1) {
                                                        for (i=0; i < item.quantity; i++) {
                                                            var coupon_serial_line = currentOrder.generateUniqueId_barcode();
                                                            new instance.web.Model("pos.coupon.line").get_func("create")
                                                                ({
                                                                    'name': coupon_serial_line,
                                                                    'amount': item.price,
                                                                    'remaining_amt': item.price,
                                                                    'product_id': item.get_product().id,
                                                                    'validity':item.get_product().validity_days, 
                                                                    'coupon_id': coupon_id
                                                                });
                                                            tr1.push($("<tr id='prod_info'><td style='text-align:center;'>-- Coupon Information --</td></tr>" +
                                                            "<tr id='prod_info'><td style='padding:2px;'>" + item.get_product().display_name + " [ Qty: " + item.quantity + ", Price: " + self.format_currency(item.price) +" ]</td></tr>"));
                                                            tr1.push($("<tr id='" + coupon_serial_line + "'><td style='padding: 2px;'><div class='" + coupon_serial_line + "' width='150' height='50'/></td></tr>"))
                                                            $('#' + coupon_serial_line.toString()).barcode(coupon_serial_line.toString(), "ean13")
                                                        }
                                                    } else {
                                                        var coupon_serial_line = currentOrder.generateUniqueId_barcode();
                                                        new instance.web.Model("pos.coupon.line").get_func("create")
                                                            ({
                                                                'name': coupon_serial_line,
                                                                'amount': item.price,
                                                                'remaining_amt': item.price,
                                                                'product_id': item.get_product().id,
                                                                'validity':item.get_product().validity_days, 
                                                                'coupon_id': coupon_id
                                                            });
                                                            tr1.push($("<tr id='prod_info'><td style='text-align:center;'>-- Coupon Information --</td></tr>" +
                                                            "<tr id='prod_info'><td style='padding:2px;'>" + item.get_product().display_name + " [ Qty: " + item.quantity + ", Price: " + self.format_currency(item.price) +" ]</td></tr>"));
                                                            tr1.push($("<tr id='" + coupon_serial_line + "'><td style='padding: 2px;'><div class='" + coupon_serial_line + "' width='150' height='50'/></td></tr>"))
                                                            $('#' + coupon_serial_line.toString()).barcode(coupon_serial_line.toString(), "ean13")
                                                    }
                                                }
                                            }));
                                            _.each(tr1, function(tr) {
                                                var tr_id = tr.attr('id').toString();
                                                $('table#barcode_table tbody').append(tr);
                                                if (tr_id.length == 13) {
                                                    $('.' + tr_id).barcode(tr_id, "ean13")
                                                }
                                            });

                                            self.pos_widget.screen_selector.set_current_screen(self.next_screen);
                                        }
                                    }
                            });
                        } else if (!coupon_id && (coupon_amt || redeem_point)) {
                            if (coupon_amt) {
                                var coupons = {};
                                var tr2 = [];
                                _.each($('span.gift_coupon_serial_input'), function(e) {
                                    if (e['id']) {
                                        serial_id = e['id'].split('_');
                                        id = serial_id[2];
                                        serial = $('#' + e['id']).html();
                                        amount = $('#gift_coupon_input_coupon_amount_' + id).html();
                                        if (serial && amount) {
                                            coupons[serial] = amount;
                                            tr2.push($("<tr id='prod_info'><td style='text-align:center;'>-- Coupon Information --</td></tr>" +
                                            "<tr id='prod_info'><td style='padding:2px;'>Serial No: " + serial + "</td></tr>"));
                                            tr2.push($("<tr id='prod_info'><td style='padding:2px;' id='remain_"+serial+"'>Remaining Amount: </td></tr>"));
                                            tr2.push($("<tr id='" + serial + "'><td style='padding: 2px; text-align:center;'><div class='" + serial + "' width='150' height='50'/></td></tr>"));
                                            $('#' + serial.toString()).barcode(serial.toString(), "ean13");
                                        }
                                    }
                                });
                                _.each(tr2, function(tr) {
                                    var tr_id = tr.attr('id').toString();
                                    $('table#barcode_table tbody').append(tr);
                                    if (tr_id.length == 13) {
                                        $('.' + tr_id).barcode(tr_id, "ean13")
                                    }
                                });
                                context['gift_amount'] = coupon_amt;
                                context['redeem_point'] = redeem_point;
                                var db_orders = currentOrder.export_as_JSON()
                                this.db = new instance.point_of_sale.PosDB();
                                this.db.add_order(db_orders);
                                orders = this.db.get_orders();
                                var posOrderModel = new instance.web.Model('pos.order');
                                var res = posOrderModel.call('create_from_ui',
                                    [_.map(orders, function (order) {
                                        order.to_invoice = options.invoice || false;
                                        return order;
                                    }), context],
                                    undefined,
                                    {
                                        shadow: !options.to_invoice,
                                    }
                                ).fail(function(e) {
                                    return;
                                }).done(function (e) {
                                    if (e) {
                                        $.each(coupons, function(key, value) {
                                            new instance.web.Model("pos.coupon.line").get_func("search_read")([['name', '=', key]], ['id', 'remaining_amt', 'coupon_id']).pipe(
                                                function(result) {
                                                    if (result && result[0]) {
                                                        var new_rem_amt = result[0].remaining_amt - value;
                                                        new instance.web.Model("pos.coupon.line").get_func("write")(result[0].id, {'remaining_amt': new_rem_amt});
                                                        new instance.web.Model("pos.coupon.history").get_func("create")({'used_amount':value, 
                                                                                                                        'coupon_id':result[0].coupon_id[0],
                                                                                                                        'used_date': mm + '/' + dd + '/' + yyyy,
                                                                                                                        'name':key,
                                                                                                                        'pos_order': db_orders.name.split(' ')[1]});
                                                    }
                                                }
                                            );
                                        });
                                    }
                                }).pipe(function(order_server_id){
                                    // generate the pdf and download it
                                    self.pos_widget.do_action('point_of_sale.pos_invoice_report',{additional_context:{ 
                                        active_ids:order_server_id,
                                    }});
                                });
                                self.pos_widget.action_bar.set_button_disabled('validation',false);
                                self.pos_widget.action_bar.set_button_disabled('invoice',false);
                                self.pos.get('selectedOrder').destroy();
                            }
                        } else {
                            var invoiced = self.pos.push_and_invoice_order(currentOrder);

                            invoiced.fail(function(error){
                                if(error === 'error-no-client'){
                                    self.pos_widget.screen_selector.show_popup('error',{
                                        message: _t('An anonymous order cannot be invoiced'),
                                        comment: _t('Please select a client for this order. This can be done by clicking the order tab'),
                                    });
                                }else{
                                    self.pos_widget.screen_selector.show_popup('error',{
                                        message: _t('The order could not be sent'),
                                        comment: _t('Check your internet connection and try again.'),
                                    });
                                }
                                self.pos_widget.action_bar.set_button_disabled('validation',false);
                                self.pos_widget.action_bar.set_button_disabled('invoice',false);
                            });
            
                            invoiced.done(function(){
                                self.pos_widget.action_bar.set_button_disabled('validation',false);
                                self.pos_widget.action_bar.set_button_disabled('invoice',false);
                                self.pos.get('selectedOrder').destroy();
                            });
                        }
                    }
                });
            }else{
                var coupon_id = currentOrder.get_coupon_id();
                var connection = false;
                var context = {};
                new instance.web.Model("pos.order").get_func("check_connection")().done(function(result) {
                    if (result) {
                        if (coupon_id) {
                            new instance.web.Model("pos.coupon").get_func("search_read")
                                                  ([['id', '=', coupon_id]], ['date_create']).pipe(
                                function(result) {
                                    if (result && result[0]) {
                                        if (currentOrder.get('orderLines').length > 0) {
                                            var tr1 = [];
                                            (currentOrder.get('orderLines')).each(_.bind( function(item) {
                                                if (item.get_product().is_coupon) {
                                                    var coupon_serial = currentOrder.generateUniqueId();
                                                    item.set_coupon_serial(coupon_serial);
                                                    if (item.quantity > 1) {
                                                        for (i=0; i < item.quantity; i++) {
                                                            var coupon_serial_line = currentOrder.generateUniqueId_barcode();
                                                            new instance.web.Model("pos.coupon.line").get_func("create")
                                                                ({
                                                                    'name': coupon_serial_line,
                                                                    'amount': item.price,
                                                                    'remaining_amt': item.price,
                                                                    'product_id': item.get_product().id,
                                                                    'validity':item.get_product().validity_days, 
                                                                    'coupon_id': coupon_id
                                                                });
                                                            tr1.push($("<tr id='prod_info'><td style='text-align:center;'>-- Coupon Information --</td></tr>" +
                                                            "<tr id='prod_info'><td style='padding:2px;'>" + item.get_product().display_name + " [ Qty: " + item.quantity + ", Price: " + self.format_currency(item.price) +" ]</td></tr>"));
                                                            tr1.push($("<tr id='" + coupon_serial_line + "'><td style='padding: 2px;'><div class='" + coupon_serial_line + "' width='150' height='50'/></td></tr>"))
                                                            $('#' + coupon_serial_line.toString()).barcode(coupon_serial_line.toString(), "ean13")
                                                        }
                                                    } else {
                                                        var coupon_serial_line = currentOrder.generateUniqueId_barcode();
                                                        new instance.web.Model("pos.coupon.line").get_func("create")
                                                            ({
                                                                'name': coupon_serial_line,
                                                                'amount': item.price,
                                                                'remaining_amt': item.price,
                                                                'product_id': item.get_product().id,
                                                                'validity':item.get_product().validity_days, 
                                                                'coupon_id': coupon_id
                                                            });
                                                            tr1.push($("<tr id='prod_info'><td style='text-align:center;'>-- Coupon Information --</td></tr>" +
                                                            "<tr id='prod_info'><td style='padding:2px;'>" + item.get_product().display_name + " [ Qty: " + item.quantity + ", Price: " + self.format_currency(item.price) +" ]</td></tr>"));
                                                            tr1.push($("<tr id='" + coupon_serial_line + "'><td style='padding: 2px;'><div class='" + coupon_serial_line + "' width='150' height='50'/></td></tr>"))
                                                            $('#' + coupon_serial_line.toString()).barcode(coupon_serial_line.toString(), "ean13")
                                                    }
                                                }
                                            }));
                                            _.each(tr1, function(tr) {
                                                var tr_id = tr.attr('id').toString();
                                                $('table#barcode_table tbody').append(tr);
                                                if (tr_id.length == 13) {
                                                    $('.' + tr_id).barcode(tr_id, "ean13")
                                                }
                                            });

                                            self.pos_widget.screen_selector.set_current_screen(self.next_screen);
                                        }
                                    }
                            });
                        } else if (!coupon_id && (coupon_amt || redeem_point)) {
                            if (coupon_amt) {
                                var coupons = {};
                                var tr2 = [];
                                _.each($('span.gift_coupon_serial_input'), function(e) {
                                    if (e['id']) {
                                        serial_id = e['id'].split('_');
                                        id = serial_id[2];
                                        serial = $('#' + e['id']).html();
                                        amount = $('#gift_coupon_input_coupon_amount_' + id).html();
                                        if (serial && amount) {
                                            coupons[serial] = amount;
                                            tr2.push($("<tr id='prod_info'><td style='text-align:center;'>-- Coupon Information --</td></tr>" +
                                            "<tr id='prod_info'><td style='padding:2px;'>Serial No: " + serial + "</td></tr>"));
                                            tr2.push($("<tr id='prod_info'><td style='padding:2px;' id='remain_"+serial+"'>Remaining Amount: </td></tr>"));
                                            tr2.push($("<tr id='" + serial + "'><td style='padding: 2px; text-align:center;'><div class='" + serial + "' width='150' height='50'/></td></tr>"));
                                            $('#' + serial.toString()).barcode(serial.toString(), "ean13");
                                        }
                                    }
                                });
                                _.each(tr2, function(tr) {
                                    var tr_id = tr.attr('id').toString();
                                    $('table#barcode_table tbody').append(tr);
                                    if (tr_id.length == 13) {
                                        $('.' + tr_id).barcode(tr_id, "ean13")
                                    }
                                });
                                context['gift_amount'] = coupon_amt;
                                context['redeem_point'] = redeem_point;
                                var db_orders = currentOrder.export_as_JSON()
                                this.db = new instance.point_of_sale.PosDB();
                                this.db.add_order(db_orders);
                                orders = this.db.get_orders();
                                var posOrderModel = new instance.web.Model('pos.order');
                                var res = posOrderModel.call('create_from_ui',
                                    [_.map(orders, function (order) {
                                        order.to_invoice = options.invoice || false;
                                        return order;
                                    }), context],
                                    undefined,
                                    {
                                        shadow: !options.to_invoice,
                                    }
                                ).fail(function(e) {
                                    return;
                                }).done(function (e) {
                                    if (e) {
                                        $.each(coupons, function(key, value) {
                                            new instance.web.Model("pos.coupon.line").get_func("search_read")([['name', '=', key]], ['id', 'remaining_amt', 'coupon_id']).pipe(
                                                function(result) {
                                                    if (result && result[0]) {
                                                        var new_rem_amt = result[0].remaining_amt - value;
                                                        new instance.web.Model("pos.coupon.line").get_func("write")(result[0].id, {'remaining_amt': new_rem_amt});
                                                        new instance.web.Model("pos.coupon.history").get_func("create")({'used_amount':value, 
                                                                                                                        'coupon_id':result[0].coupon_id[0],
                                                                                                                        'used_date': mm + '/' + dd + '/' + yyyy,
                                                                                                                        'name':key,
                                                                                                                        'pos_order': db_orders.name.split(' ')[1]});
                                                    }
                                                }
                                            );
                                        });
                                    }
                                    if(self.pos.config.iface_print_via_proxy){
                                        var receipt = currentOrder.export_for_printing();
                                        self.pos.proxy.print_receipt(QWeb.render('XmlReceipt',{
                                            receipt: receipt, widget: self,
                                        }));
                                        self.pos.get('selectedOrder').destroy();    //finish order and go back to scan screen
                                    } else {
                                        self.pos_widget.screen_selector.set_current_screen(self.next_screen);
                                    }
                                });
                            }
                        }
                    }
                });
                self.pos.push_order(currentOrder) 
                if(self.pos.config.iface_print_via_proxy){
                    var receipt = currentOrder.export_for_printing();
                    self.pos.proxy.print_receipt(QWeb.render('XmlReceipt',{
                        receipt: receipt, widget: self,
                    }));
                    self.pos.get('selectedOrder').destroy();    //finish order and go back to scan screen
                } else {
                    self.pos_widget.screen_selector.set_current_screen(self.next_screen);
                }
            }

            // hide onscreen (iOS) keyboard 
            setTimeout(function(){
                document.activeElement.blur();
                $("input").blur();
            },250);
        },
        add_paymentline: function(line) {
            var list_container = this.el.querySelector('.payment-lines');
                if (list_container) {
                    list_container.appendChild(this.render_paymentline(line));
                }
            
            if(this.numpad_state){
                this.numpad_state.reset();
            }
        },
    });
    
    instance.point_of_sale.ReceiptScreenWidget = instance.point_of_sale.ReceiptScreenWidget.extend({
        finishOrder: function() {
            this.pos.get('selectedOrder').set_ret_o_id('')
            this.pos.get('selectedOrder').destroy();
            $("span#sale_mode").css('background', 'blue');
            $("span#return_order").css('background', '');
            $("span#missing_return_order").css('background', '');
            $('#return_order_ref').html('');
            $('#return_order_number').val('');
            $('span#coupon_name').html('');
        }
    });

    instance.point_of_sale.Order = instance.point_of_sale.Order.extend({
        initialize: function(attributes){
            Backbone.Model.prototype.initialize.apply(this, arguments);
            this.pos = attributes.pos; 
            this.sequence_number = this.pos.pos_session.sequence_number++;
            this.uid =     this.generateUniqueId();
            this.set({
                creationDate:   new Date(),
                orderLines:     new instance.point_of_sale.OrderlineCollection(),
                paymentLines:   new instance.point_of_sale.PaymentlineCollection(),
                name:           _t("Order ") + this.uid,
                client:         null,
                ret_o_id:       null,
                ret_o_ref:      null,
                coupon:         null,
                coupon_id:      null,
                coupon_amount:  0.0,
                redeem_point:   0,
                client_name:    null,
            });
            this.selected_orderline   = undefined;
            this.selected_paymentline = undefined;
            this.screen_data = {};  // see ScreenSelector
            this.receipt_type = 'receipt';  // 'receipt' || 'invoice'
            this.temporary = attributes.temporary || false;
            return this;
        },
        set_client_name: function(client_name) {
            this.set('client_name', client_name);
        },
        get_client_name: function(){
            if (!this.get('client') && this.get('client_name')) {
                return this.get('client_name');
            } else {
                var client = this.get('client');
                return client ? client.name : "";
            }
        },
        generateUniqueId_barcode: function() {
            return new Date().getTime();
        },
        set_redeem_point: function(redeem_point) {
            this.set('redeem_point', redeem_point)
        },
        get_redeem_point: function() {
            return this.get('redeem_point');
        },
        set_coupon_amount: function(coupon_amount) {
            this.set('coupon_amount', coupon_amount)
        },
        get_coupon_amount: function() {
            return this.get('coupon_amount');
        },
        set_coupon_id: function(coupon_id) {
            this.set('coupon_id', coupon_id)
        },
        set_coupon: function(coupon) {
            this.set('coupon', coupon)
        },
        get_coupon_id: function(){
            return this.get('coupon_id');
        },
        get_coupon: function(){
            var coupon = this.get('coupon');
            return coupon ? coupon : "";
        },
        setCpnAmt: function(cpn_amt) {
            this.set('cpn_amt', cpn_amt)
        },
        getCpnAmt: function() {
            return this.get('cpn_amt');
        },
        getChange: function() {
            if (this.getCpnAmt() > 0.0) {
                change = this.getPaidTotal() - this.getTotalTaxIncluded();
                return parseFloat(this.getCpnAmt()) + parseFloat(change.toFixed(2));
            } else {
                return this.getPaidTotal() - this.getTotalTaxIncluded();
            }
        },
        set_ret_o_id: function(ret_o_id) {
            this.set('ret_o_id', ret_o_id)
        },
        get_ret_o_id: function(){
            return this.get('ret_o_id');
        },
        set_ret_o_ref: function(ret_o_ref) {
            this.set('ret_o_ref', ret_o_ref)
        },
        get_ret_o_ref: function(){
            return this.get('ret_o_ref');
        },
        getName: function() {
            return this.get('name');
        },
        addProduct: function(product, options){
            options = options || {};
            var attr = JSON.parse(JSON.stringify(product));
            attr.pos = this.pos;
            attr.order = this;
            var retoid = this.pos.get('selectedOrder').get_ret_o_id();
            
            if (attr.is_coupon && $('span#coupon_name').html() != 'Coupon Created') {
                alert ('Please click on Create Coupon Button !');
                return;
            }
            
            var line = new instance.point_of_sale.Orderline({}, {pos: this.pos, order: this, product: product});
            
            if (!retoid && (product.track_incoming || product.track_all)) {
                var self = this;
                dialog = new instance.web.Dialog(this, {
                    title: _t("Enter Serial Number"),
                    size: 'medium',
                    buttons: [
                        {text: _t("Validate"), click: function() { 
                            var sr_no = dialog.$el.find("input#pos_serial").val();
                            line.set_serial(sr_no);
                            sr_no = jQuery.trim(sr_no);
                            if (sr_no.length > 0) {
                                new instance.web.Model("stock.production.lot").get_func("search_read")
                                            ([['product_id', '=', attr.id], ['name', '=', sr_no]]).pipe(
                                    function(result) {
                                        if (result && result.length > 0) {
                                            new instance.web.Model("stock.production.lot").get_func("check_stock_lot")(result[0].id).pipe(
                                                function(lot_res){
                                                    if (lot_res > 0) {
                                                        line.set_serial_id(result[0].id);
                                                        (self.get('orderLines')).each(_.bind( function(item) {
                                                            if (item.get_product().id == attr.id && item.get_serial() == sr_no) {
                                                                alert('Same product is already assigned with same serial number !');
                                                                sr_no = null;
                                                                return false;
                                                            }
                                                        }, this));
                                                        if (sr_no != null) {
                                                            if(options.quantity !== undefined){
                                                                line.set_quantity(options.quantity);
                                                            }
                                                            if(options.price !== undefined){
                                                                line.set_unit_price(options.price);
                                                            }
                                                            if(options.discount !== undefined){
                                                                line.set_discount(options.discount);
                                                            }
                                                
                                                            var last_orderline = self.getLastOrderline();
                                                            if( last_orderline && last_orderline.can_be_merged_with(line) && options.merge !== false){
                                                                last_orderline.merge(line);
                                                            }else{
                                                                self.get('orderLines').add(line);
                                                            }
                                                            self.selectLine(self.getLastOrderline());
                                                        }
                                                    } else {
                                                        alert (_t('Not enough quantity in this serial number !'))
                                                    }
                                                });
                                        } else {
                                            alert (_t('Invalid serial number !'));
                                            return false;
                                        }
                                    }
                                );
                                this.parents('.modal').modal('hide');
                           } else {
                               alert (_t('Invalid serial number !'));
                               return;
                           }
                        }},
                        {text: _t("Cancel"), click: function() { this.parents('.modal').modal('hide');}}
                    ]
                }).open();
                dialog.$el.html(QWeb.render("pos-assign_serial", self));
                dialog.$el.find("#pos_serial").focus();
                $('.searchbox input').val('');
            } else if (retoid && retoid.toString() != 'Missing Receipt') {
                var pids = [];
                new instance.web.Model("pos.order.line").get_func("search_read")
                                    ([['order_id', '=', retoid],['product_id', '=', attr.id],['return_qty', '>', 0]], 
                                    ['return_qty', 'id', 'price_unit', 'discount']).pipe(
                    function(result) {
                        if (result && result.length > 0) {
                            if (result[0].return_qty > 0) {
                                add_prod = true;
                                (attr.order.get('orderLines')).each(_.bind( function(item) {
                                    if (attr.id == item.get_product().id && 
                                        result[0].return_qty <= item.quantity) {
                                        var error_str = _t('Can not return more products !');
                                        var error_dialog = new instance.web.Dialog(this, { 
                                            width: '300',
                                            buttons: [{text: _t("Close"), click: function() { this.parents('.modal').modal('hide'); }}],
                                        }).open();
                                        error_dialog.$el.append(
                                            '<span id="error_str" style="font-size:18px;">' + error_str + '</span>');
                                        add_prod = false;
                                    }
                                }, self));
                                
                                if (add_prod) {
                                    var line = new instance.point_of_sale.Orderline({}, {pos: attr.pos, order: this, product: product});
                                    line.set_oid(retoid);
                                    
                                    if (result[0].discount) {
                                        line.set_discount(result[0].discount);
                                    }
                                    
                                    if(options.quantity !== undefined){
                                        line.set_quantity(options.quantity);
                                    }
                                    if(options.price !== undefined){
                                        line.set_unit_price(result[0].price_unit);
                                    }
                                    line.set_unit_price(result[0].price_unit);
                                    var last_orderline = attr.order.getLastOrderline();
                                    if( last_orderline && last_orderline.can_be_merged_with(line) && options.merge !== false){
                                        last_orderline.merge(line);
                                    }else{
                                        attr.order.get('orderLines').add(line);
                                    }
                                    attr.order.selectLine(attr.order.getLastOrderline());
                                }
                            } else {
                                var error_str = _t('Please check quantity of selected product & sold product !');
                                var error_dialog = new instance.web.Dialog(this, { 
                                    width: '350',
                                    buttons: [{text: _t("Close"), click: function() { this.parents('.modal').modal('hide'); }}],
                                }).open();
                                error_dialog.$el.append(
                                    '<span id="error_str" style="font-size:18px;">' + error_str + '</span>');
                                return;
                            }
                    } else {
                        var error_str = _t('Product is not in order list !');
                        var error_dialog = new instance.web.Dialog(this, { 
                            width: '300',
                            buttons: [{text: _t("Close"), click: function() { this.parents('.modal').modal('hide'); }}],
                        }).open();
                        error_dialog.$el.append(
                            '<span id="error_str" style="font-size:18px;">' + error_str + '</span>');
                    }
                });
            } else {
                if (retoid && retoid.toString() != 'Missing Receipt') {
                    line.set_oid(retoid);
                }
                if(options.quantity !== undefined){
                    line.set_quantity(options.quantity);
                }
                if(options.price !== undefined){
                    line.set_unit_price(options.price);
                }
                if(options.discount !== undefined){
                    line.set_discount(options.discount);
                }
    
                var last_orderline = this.getLastOrderline();
                if( last_orderline && last_orderline.can_be_merged_with(line) && options.merge !== false){
                    last_orderline.merge(line);
                }else{
                    this.get('orderLines').add(line);
                }
                this.selectLine(this.getLastOrderline());
            }
        },
        export_as_JSON: function() {
            var orderLines, paymentLines;
            
            parent_return_order = '';
            var ret_o_id = this.get_ret_o_id();
            var ret_o_ref = this.get_ret_o_ref();
            var return_seq = 0;
            
            orderLines = [];
            (this.get('orderLines')).each(_.bind( function(item) {
                return orderLines.push([0, 0, item.export_as_JSON()]);
            }, this));
            paymentLines = [];
            (this.get('paymentLines')).each(_.bind( function(item) {
                return paymentLines.push([0, 0, item.export_as_JSON()]);
            }, this));
            
            var barcode_val = this.getName();
            if (barcode_val.indexOf('Order') != -1) {
                var vals = barcode_val.split('Order ');
                if (vals) {
                    barcode = vals[1];
                    $("#barcode1").barcode(barcode, "ean13");
                }
            }
            if (ret_o_id) {
                parent_return_order = this.get_ret_o_id();
            }
            
            return {
                name: this.getName(),
                amount_paid: this.getPaidTotal(),
                amount_total: this.getTotalTaxIncluded(),
                amount_tax: this.getTax(),
                amount_return: this.getChange(),
                lines: orderLines,
                statement_ids: paymentLines,
                pos_session_id: this.pos.pos_session.id,
                partner_id: this.get_client() ? this.get_client().id : false,
                user_id: this.pos.cashier ? this.pos.cashier.id : this.pos.user.id,
                uid: this.uid,
                sequence_number: this.sequence_number,
                parent_return_order: parent_return_order, // Required to create paid return order
                return_seq: return_seq || 0,
                back_order: this.get_ret_o_ref()
            };
        },
    });
    
    instance.point_of_sale.ProductCategoriesWidget = instance.point_of_sale.ProductCategoriesWidget.extend({
        perform_search: function(category, query, buy_result){
            if(query){
                var products = this.pos.db.search_product_in_category(category.id,query)
                if(buy_result && products.length === 1){
                        this.pos.get('selectedOrder').addProduct(products[0]);
//                        this.clear_search();
                }else{
                    this.product_list_widget.set_product_list(products);
                }
            }else{
                var products = this.pos.db.get_product_by_category(this.category.id);
                this.product_list_widget.set_product_list(products);
            }
        },
    });
    
    instance.point_of_sale.OrderWidget = instance.point_of_sale.OrderWidget.extend({
        set_value: function(val) {
            var order = this.pos.get('selectedOrder');
            if (this.editable && order.getSelectedLine()) {
                var mode = this.numpad_state.get('mode');
                if( mode === 'quantity'){
                    var ret_o_id = order.get_ret_o_id();
                    if (val != 'remove' && val != '' && order.getSelectedLine().get_serial()) {
                        alert('Can not change quantity if serial number assigned !');
                    } else if (ret_o_id && ret_o_id.toString() != 'Missing Receipt') {
                        var self = this;
                        var pids = [];
                        new instance.web.Model("pos.order.line").get_func("search_read")
                                            ([['order_id', '=', ret_o_id],['product_id', '=', prod_id],['return_qty', '>', 0]], 
                                            ['return_qty', 'id']).pipe(
                            function(result) {
                                if (result && result.length > 0) {
                                    if (result[0].return_qty > 0) {
                                        add_prod = true;
                                        (order.get('orderLines')).each(_.bind( function(item) {
                                            if (prod_id == item.get_product().id && 
                                                result[0].return_qty < parseInt(val)) {
                                                var error_str = _t('Can not return more products !');
                                                var error_dialog = new instance.web.Dialog(this, { 
                                                    width: '300',
                                                    buttons: [{text: _t("Close"), click: function() { $(this).dialog('destroy'); }}],
                                                }).open();
                                                error_dialog.$el.append(
                                                    '<span id="error_str" style="font-size:18px;">' + error_str + '</span>');
                                                add_prod = false;
                                            }
                                        }));
                                    }
                                    if (add_prod) {
                                        order.getSelectedLine().set_quantity(val);
                                    }
                                }
                            }
                        );
                    } else {
                        order.getSelectedLine().set_quantity(val);
                    }
                }else if( mode === 'discount'){
                    order.getSelectedLine().set_discount(val);
                }else if( mode === 'price'){
                    order.getSelectedLine().set_unit_price(val);
                }
            }
        },
    });
    
    var orderline_id = 1;
    
    instance.point_of_sale.Orderline = instance.point_of_sale.Orderline.extend({
        initialize: function(attr,options){
            this.pos = options.pos;
            this.order = options.order;
            this.product = options.product;
            this.price   = options.product.price;
            this.quantity = 1;
            this.quantityStr = '1';
            this.discount = 0;
            this.discountStr = '0';
            this.type = 'unit';
            this.selected = false;
            this.id       = orderline_id++;
            this.prodlot_id = null;
            this.prodlot_id_id = null;
            this.oid = null;
            this.coupon_serial = null;
        },
        set_coupon_serial: function(coupon_serial) {
            this.set('coupon_serial', coupon_serial)
        },
        get_coupon_serial: function() {
            return this.get('coupon_serial');
        },
        set_serial_id: function(sr_no_id) {
            this.prodlot_id_id = sr_no_id;
        },
        get_serial_id: function() {
            return this.prodlot_id_id;
        },
        set_serial: function(sr_no) {
            this.prodlot_id = sr_no;
        },
        get_serial: function() {
            return this.prodlot_id;
        },
        can_be_merged_with: function(orderline){
            if( this.get_product().id !== orderline.get_product().id){    //only orderline of the same product can be merged
                return false;
            }else if(!this.get_unit() || !this.get_unit().groupable){
                return false;
            }else if(this.get_product_type() !== orderline.get_product_type()){
                return false;
            }else if(this.get_discount() > 0){             // we don't merge discounted orderlines
                return false;
            }else if(this.price !== orderline.price){
                return false;
            } else if(this.get_serial()) {
                return false;
            }else{ 
                return true;
            }
        },
        set_quantity: function(quantity){
            if(quantity === 'remove'){
                this.set_oid('');
                this.pos.get('selectedOrder').removeOrderline(this);
                return;
            }else{
                var quant = parseFloat(quantity) || 0;
                var unit = this.get_unit();
                if(unit){
                    this.quantity    = round_pr(quant, unit.rounding);
                    this.quantityStr = this.quantity.toFixed(Math.ceil(Math.log(1.0 / unit.rounding) / Math.log(10)));
                }else{
                    this.quantity    = quant;
                    this.quantityStr = '' + this.quantity;
                }
            }
            this.trigger('change',this);
        },
        export_as_JSON: function() {
            var self = this;
            var oid = this.get_oid();
            var qty = this.get_quantity();
            var return_process = false;
            if (oid) {
                return_process = true;
            } else {
                var return_qty = this.get_quantity();
            }
            var order_ref = this.pos.get('selectedOrder').get_ret_o_id();
            if (order_ref) {
                qty = this.get_quantity() * -1;
            }
            return {
                qty: qty,
                return_process: return_process,
                return_qty: parseInt(return_qty),
                price_unit: this.get_unit_price(),
                discount: this.get_discount(),
                product_id: this.get_product().id,
                prodlot_id: this.get_serial_id(),
            };
        },
        set_oid: function(oid) {
            this.set('oid', oid)
        },
        get_oid: function() {
            return this.get('oid');
        },
    });
    
    instance.point_of_sale.PosModel = instance.point_of_sale.PosModel.extend({
        models: [
        {
            model:  'res.users',
            fields: ['name','company_id'],
            domain: function(self){ return [['id','=',self.session.uid]]; },
            loaded: function(self,users){ self.user = users[0]; },
        },{ 
            model:  'res.company',
            fields: [ 'currency_id', 'email', 'website', 'company_registry', 'vat', 'name', 'phone', 'partner_id' , 'country_id'],
            domain: function(self){ return [['id','=',self.user.company_id[0]]]; },
            loaded: function(self,companies){ self.company = companies[0]; },
        },{
            model:  'decimal.precision',
            fields: ['name','digits'],
            loaded: function(self,dps){
                self.dp  = {};
                for (var i = 0; i < dps.length; i++) {
                    self.dp[dps[i].name] = dps[i].digits;
                }
            },
        },{
            model:  'product.uom',
            fields: [],
            domain: null,
            loaded: function(self,units){
                self.units = units;
                var units_by_id = {};
                for(var i = 0, len = units.length; i < len; i++){
                    units_by_id[units[i].id] = units[i];
                    units[i].groupable = ( units[i].category_id[0] === 1 );
                    units[i].is_unit   = ( units[i].id === 1 );
                }
                self.units_by_id = units_by_id;
            }
        },{
            model:  'res.users',
            fields: ['name','ean13'],
            domain: null,
            loaded: function(self,users){ self.users = users; },
        },{
            model:  'res.partner',
            fields: ['name','street','city','state_id','country_id','vat','phone','zip','mobile','email','ean13','write_date'],
            domain: null,
            loaded: function(self,partners){
                self.partners = partners;
                self.db.add_partners(partners);
            },
        },{
            model:  'res.country',
            fields: ['name'],
            loaded: function(self,countries){
                self.countries = countries;
                self.company.country = null;
                for (var i = 0; i < countries.length; i++) {
                    if (countries[i].id === self.company.country_id[0]){
                        self.company.country = countries[i];
                    }
                }
            },
        },{
            model:  'account.tax',
            fields: ['name','amount', 'price_include', 'include_base_amount', 'type'],
            domain: null,
            loaded: function(self,taxes){ 
                self.taxes = taxes; 
                self.taxes_by_id = {};
                for (var i = 0; i < taxes.length; i++) {
                    self.taxes_by_id[taxes[i].id] = taxes[i];
                }
            },
        },{
            model:  'pos.session',
            fields: ['id', 'journal_ids','name','user_id','config_id','start_at','stop_at','sequence_number','login_number'],
            domain: function(self){ return [['state','=','opened'],['user_id','=',self.session.uid]]; },
            loaded: function(self,pos_sessions){
                self.pos_session = pos_sessions[0]; 

                var orders = self.db.get_orders();
                for (var i = 0; i < orders.length; i++) {
                    self.pos_session.sequence_number = Math.max(self.pos_session.sequence_number, orders[i].data.sequence_number+1);
                }
            },
        },{
            model: 'pos.config',
            fields: [],
            domain: function(self){ return [['id','=', self.pos_session.config_id[0]]]; },
            loaded: function(self,configs){
                self.config = configs[0];
                self.config.use_proxy = self.config.iface_payment_terminal || 
                                        self.config.iface_electronic_scale ||
                                        self.config.iface_print_via_proxy  ||
                                        self.config.iface_scan_via_proxy   ||
                                        self.config.iface_cashdrawer;
                
                self.barcode_reader.add_barcode_patterns({
                    'product':  self.config.barcode_product,
                    'cashier':  self.config.barcode_cashier,
                    'client':   self.config.barcode_customer,
                    'weight':   self.config.barcode_weight,
                    'discount': self.config.barcode_discount,
                    'price':    self.config.barcode_price,
                });

                if (self.config.company_id[0] !== self.user.company_id[0]) {
                    throw new Error(_t("Error: The Point of Sale User must belong to the same company as the Point of Sale. You are probably trying to load the point of sale as an administrator in a multi-company setup, with the administrator account set to the wrong company."));
                }
            },
        },{
            model: 'stock.location',
            fields: [],
            domain: function(self){ return [['id','=', self.config.stock_location_id[0]]]; },
            loaded: function(self, locations){ self.shop = locations[0]; },
        },{
            model:  'product.pricelist',
            fields: ['currency_id'],
            domain: function(self){ return [['id','=',self.config.pricelist_id[0]]]; },
            loaded: function(self, pricelists){ self.pricelist = pricelists[0]; },
        },{
            model: 'res.currency',
            fields: ['symbol','position','rounding','accuracy'],
            ids:    function(self){ return [self.pricelist.currency_id[0]]; },
            loaded: function(self, currencies){
                self.currency = currencies[0];
                if (self.currency.rounding > 0) {
                    self.currency.decimals = Math.ceil(Math.log(1.0 / self.currency.rounding) / Math.log(10));
                } else {
                    self.currency.decimals = 0;
                }

            },
        },{
            model: 'product.packaging',
            fields: ['ean','product_tmpl_id'],
            domain: null,
            loaded: function(self, packagings){ 
                self.db.add_packagings(packagings);
            },
        },{
            model:  'pos.category',
            fields: ['id','name','parent_id','child_id','image'],
            domain: null,
            loaded: function(self, categories){
                self.db.add_categories(categories);
            },
        },{
            model:  'product.product',
            fields: ['display_name', 'list_price','price','pos_categ_id', 'taxes_id', 'ean13', 'default_code', 'track_incoming',
                     'to_weight', 'uom_id', 'uos_id', 'uos_coeff', 'mes_type', 'description_sale', 'description', 'track_all',
                     'product_tmpl_id', 'is_coupon'],
            domain:  function(self){ return [['sale_ok','=',true],['available_in_pos','=',true]]; },
            context: function(self){ return { pricelist: self.pricelist.id, display_default_code: false }; },
            loaded: function(self, products){
                self.db.add_products(products);
            },
        },{
            model:  'account.bank.statement',
            fields: ['account_id','currency','journal_id','state','name','user_id','pos_session_id'],
            domain: function(self){ return [['state', '=', 'open'],['pos_session_id', '=', self.pos_session.id]]; },
            loaded: function(self, bankstatements, tmp){
                self.bankstatements = bankstatements;

                tmp.journals = [];
                _.each(bankstatements,function(statement){
                    tmp.journals.push(statement.journal_id[0]);
                });
            },
        },{
            model:  'account.journal',
            fields: [],
            domain: function(self,tmp){ return [['id','in',tmp.journals]]; },
            loaded: function(self, journals){
                self.journals = journals;

                // associate the bank statements with their journals. 
                var bankstatements = self.bankstatements;
                for(var i = 0, ilen = bankstatements.length; i < ilen; i++){
                    for(var j = 0, jlen = journals.length; j < jlen; j++){
                        if(bankstatements[i].journal_id[0] === journals[j].id){
                            bankstatements[i].journal = journals[j];
                        }
                    }
                }
                self.cashregisters = bankstatements;
            },
        },{
            label: 'fonts',
            loaded: function(self){
                var fonts_loaded = new $.Deferred();

                // Waiting for fonts to be loaded to prevent receipt printing
                // from printing empty receipt while loading Inconsolata
                // ( The font used for the receipt ) 
                waitForWebfonts(['Lato','Inconsolata'], function(){
                    fonts_loaded.resolve();
                });

                // The JS used to detect font loading is not 100% robust, so
                // do not wait more than 5sec
                setTimeout(function(){
                    fonts_loaded.resolve();
                },5000);

                return fonts_loaded;
            },
        },{
            label: 'pictures',
            loaded: function(self){
                self.company_logo = new Image();
                var  logo_loaded = new $.Deferred();
                self.company_logo.onload = function(){
                    var img = self.company_logo;
                    var ratio = 1;
                    var targetwidth = 300;
                    var maxheight = 150;
                    if( img.width !== targetwidth ){
                        ratio = targetwidth / img.width;
                    }
                    if( img.height * ratio > maxheight ){
                        ratio = maxheight / img.height;
                    }
                    var width  = Math.floor(img.width * ratio);
                    var height = Math.floor(img.height * ratio);
                    var c = document.createElement('canvas');
                        c.width  = width;
                        c.height = height
                    var ctx = c.getContext('2d');
                        ctx.drawImage(self.company_logo,0,0, width, height);

                    self.company_logo_base64 = c.toDataURL();
                    logo_loaded.resolve();
                };
                self.company_logo.onerror = function(){
                    logo_loaded.reject();
                };
                    self.company_logo.crossOrigin = "anonymous";
                self.company_logo.src = '/web/binary/company_logo' +'?_'+Math.random();

                return logo_loaded;
            },
        },
        ],
    });
}