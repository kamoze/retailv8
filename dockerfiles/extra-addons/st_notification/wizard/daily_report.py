# -*- coding: utf-8 -*-
#/#############################################################################
#
#    Span Tree
#    Copyright (C) 2004-TODAY Span Tree(<http://www.spantreeng.com/>).
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
#/#############################################################################

from openerp.osv import osv, fields
import datetime
from openerp import tools
import contextlib
from datetime import date, timedelta
import dateutil.relativedelta

class product_product(osv.osv):
    
    _inherit = 'product.product'
    
    def get_daily_report(self, cr, uid, context = None):
        if not context:
            context = {}
        shop_obj = self.pool.get('stock.warehouse')
        mail_obj = self.pool.get('mail.mail')
        sale_obj = self.pool.get('sale.order')
        invoice_obj = self.pool.get('account.invoice')
        product_obj = self.pool.get('product.product')
        purchase_obj = self.pool.get('purchase.order')
        voucher_obj = self.pool.get('account.voucher')
        user_rec = self.pool.get("res.users").browse(cr, uid, 1, context = context)
        shop_ids = shop_obj.search(cr, uid, [], context = context)
        sale_data = []
        stock_data = []
        expense_data = []
        if shop_ids:
            for shop in shop_obj.browse(cr, uid, shop_ids, context = context):
                amount_total = 0.0
                today_date = datetime.datetime.now()
                today_date = today_date.strftime(tools.DEFAULT_SERVER_DATE_FORMAT)
                sale_ids = sale_obj.search(cr, uid, [('warehouse_id','=',shop.id)], context = context)
                sale_recs = sale_obj.browse(cr, uid, sale_ids, context = context)
                invoice_ids = []
                for s_rec in sale_recs:
                    if s_rec.invoice_ids:
                        for invoice in s_rec.invoice_ids:
                            invoice_ids.append(invoice.id)
                if invoice_ids:
                    invoice_ids = invoice_obj.search(cr, uid, [('id', 'in', invoice_ids), ('date_invoice','=',today_date)])
                    for invoice in invoice_obj.browse(cr, uid, invoice_ids, context = context):
                        amount_total += invoice.amount_total
                sale_data.append([shop.name, amount_total])
                
                product_ids = product_obj.search(cr, uid, [], context = context)
                amount_total = 0.0
                for product in product_obj.browse(cr, uid, product_ids, context = context):
                    context.update({'warehouse': shop.id, 'from_date': today_date, 'to_date': today_date})
                    data = product_obj._product_available(cr, uid, [product.id], field_names=None, arg=False, context=context)
                    #context.update({'shop':shop.id,'states': ('done',), 'what': ('in', 'out') , 'from_date':today_date, 'to_date':today_date})
                    #data = product_obj.get_product_available(cr, uid, [product.id], context = context)
                    if data.get(product.id):
                        amount_total += data.get(product.id)['qty_available'] * product.standard_price
                stock_data.append([shop.name,amount_total])
                amount_total = 0.0
                invoice_ids = invoice_obj.search(cr, uid, [('type','=','in_invoice'), ('date_invoice','=',today_date)])
                for invoice in invoice_obj.browse(cr, uid, invoice_ids, context = context):
                    amount_total += invoice.amount_total
                voucher_id = voucher_obj.search(cr, uid, [('shop_id','=',shop.id),('date','=',today_date),
                                                          ('type', 'in', ['purchase','payment','receipt'])])
                for voucher in voucher_obj.browse(cr, uid, voucher_id, context = context):
                    amount_total += voucher.amount
                expense_data.append([shop.name,amount_total])
            symbol = user_rec.company_id.currency_id.symbol
            # Sale Data
            body = "<html><body><b>Sales Figure</b><table>"
            total_amount = 0.0
            for data in sale_data:
                body += "<tr><td>"+data[0]+"     :</td><td style='float:right'>"+symbol+str(data[1])+"</td></tr>"
                total_amount += data[1]
            body += "<tr><td style='border-top:1px solid;border-bottom:1px solid;'>Total :</td><td style='border-top:1px solid;border-bottom:1px solid;float:right'>"+symbol+str(total_amount)+"</td></tr>"
            # Expense Data
            body += "</table><br/><br/><b>Expense Calculation</b><table>"
            total_amount = 0.0
            for data in expense_data:
                body += "<tr><td>"+data[0]+"     :</td><td style='float:right'>"+symbol+str(data[1])+"</td></tr>"
                total_amount += data[1]
            body += "<tr><td style='border-top:1px solid;border-bottom:1px solid;'>Total :</td><td style='border-top:1px solid;border-bottom:1px solid;float:right'>"+symbol+str(total_amount)+"</td></tr>"
            # Stock Data
            total_amount = 0.0
            body += "</table><br/><br/><b>Stock Figure</b><table>"
            for data in stock_data:
                body += "<tr><td>"+data[0]+"     :</td><td style='float:right'>"+symbol+str(data[1])+"</td></tr>"
                total_amount += data[1]
            body += "<tr><td style='border-top:1px solid;border-bottom:1px solid;'>Total :</td><td style='border-top:1px solid;border-bottom:1px solid;float:right'>"+symbol+str(total_amount)+"</td></tr>"
            body += '</table></body></html>'
            email_to = ''
            user_ids = []
            group_check_total_id = self.pool.get('ir.model.data').get_object_reference(cr, uid, 'base', 'group_sale_manager')[1]
            group_check_total = self.pool.get('res.groups').browse(cr, uid, group_check_total_id, context=context)
            for x in group_check_total.users:
                if x.id not in user_ids:
                    user_ids.append(x.id)
                    email_to += x.email + ','
            group_check_total_id = self.pool.get('ir.model.data').get_object_reference(cr, uid, 'stock', 'group_stock_manager')[1]
            group_check_total = self.pool.get('res.groups').browse(cr, uid, group_check_total_id, context=context)
            for x in group_check_total.users:
                if x.id not in user_ids:
                    user_ids.append(x.id)
                    email_to += x.email + ','
            group_check_total_id = self.pool.get('ir.model.data').get_object_reference(cr, uid, 'purchase', 'group_purchase_manager')[1]
            group_check_total = self.pool.get('res.groups').browse(cr, uid, group_check_total_id, context=context)
            for x in group_check_total.users:
                if x.id not in user_ids:
                    user_ids.append(x.id)
                    email_to += x.email + ','
#             if group_check_total and uid in [x.id for x in group_check_total.users]:
            subject = "Openerp/Odoo Daily Report for " +user_rec.company_id.name +"as @ " + today_date
            vals = {'email_from': user_rec.email,
                            'email_to': email_to,
                            'state': 'outgoing',
                            'subject': subject,
                            'body_html': body,
                            'type':'email',
                            'auto_delete': True}
            mail_ids = []
            mail_ids.append(self.pool.get('mail.mail').create(cr, uid, vals, context=context))
            mail_obj.send(cr, uid, mail_ids, context = context)
        return True

    def get_weekly_report(self, cr, uid, context = None):
        if not context:
            context = {}
        shop_obj = self.pool.get('stock.warehouse')
        mail_obj = self.pool.get('mail.mail')
        sale_obj = self.pool.get('sale.order')
        invoice_obj = self.pool.get('account.invoice')
        product_obj = self.pool.get('product.product')
        purchase_obj = self.pool.get('purchase.order')
        voucher_obj = self.pool.get('account.voucher')
        user_rec = self.pool.get("res.users").browse(cr, uid, 1, context = context)
        shop_ids = shop_obj.search(cr, uid, [], context = context)
        sale_data = []
        stock_data = []
        expense_data = []
        if shop_ids:
            for shop in shop_obj.browse(cr, uid, shop_ids, context = context):
                amount_total = 0.0
                today_date = datetime.datetime.now()
                today_date = today_date.strftime(tools.DEFAULT_SERVER_DATE_FORMAT)
                from_date = (date.today() - timedelta(days=7)).strftime(tools.DEFAULT_SERVER_DATE_FORMAT)
                sale_ids = sale_obj.search(cr, uid, [('shop_id','=',shop.id)], context = context)
                sale_recs = sale_obj.browse(cr, uid, sale_ids, context = context)
                invoice_ids = []
                for s_rec in sale_recs:
                    if s_rec.invoice_ids:
                        for invoice in s_rec.invoice_ids:
                            invoice_ids.append(invoice.id)
                if invoice_ids:
                    invoice_ids = invoice_obj.search(cr, uid, [('id', 'in', invoice_ids), '&',('date_invoice','<=',today_date),
                                                               ('date_invoice','>=',from_date)])
                    for invoice in invoice_obj.browse(cr, uid, invoice_ids, context = context):
                        amount_total += invoice.amount_total
                sale_data.append([shop.name, amount_total])
                
                product_ids = product_obj.search(cr, uid, [], context = context)
                amount_total = 0.0
                for product in product_obj.browse(cr, uid, product_ids, context = context):
                    context.update({'warehouse': shop.id, 'from_date': today_date, 'to_date': from_date})
                    data = product_obj._product_available(cr, uid, [product.id], field_names=None, arg=False, context=context)
                    #context.update({'shop':shop.id,'states': ('done',), 'what': ('in', 'out'), 'from_date':today_date, 'to_date':from_date})
                    #data = product_obj.get_product_available(cr, uid, [product.id], context = context)
                    if data.get(product.id):
                        amount_total += data.get(product.id)['qty_available'] * product.standard_price
                stock_data.append([shop.name,amount_total])
                amount_total = 0.0
                invoice_ids = invoice_obj.search(cr, uid, [('type','=','in_invoice'),('shop_id','=',shop.id),
                                                            '&',('date_invoice','<=',today_date), ('date_invoice','>=',from_date)])
                for invoice in invoice_obj.browse(cr, uid, invoice_ids, context = context):
                    amount_total += invoice.amount_total
                voucher_id = voucher_obj.search(cr, uid, [('shop_id','=',shop.id),
                                                          ('type', 'in', ['purchase','payment','receipt']),
                                                          '&',('date','<=',today_date), ('date','>=',from_date)])
                for voucher in voucher_obj.browse(cr, uid, voucher_id, context = context):
                    amount_total += voucher.amount
                expense_data.append([shop.name,amount_total])
            symbol = user_rec.company_id.currency_id.symbol
            body = "<html><body><b>Sales Figure</b><table>"
            total_amount = 0.0
            for data in sale_data:
                body += "<tr><td>"+data[0]+"     :</td><td style='float:right'>"+symbol+str(data[1])+"</td></tr>"
                total_amount += data[1]
            body += "<tr><td style='border-top:1px solid;border-bottom:1px solid;'>Total :</td><td style='border-top:1px solid;border-bottom:1px solid;float:right'>"+symbol+str(total_amount)+"</td></tr>"
            # Expense Data
            body += "</table><br/><br/><b>Expense Calculation</b><table>"
            total_amount = 0.0
            for data in expense_data:
                body += "<tr><td>"+data[0]+"     :</td><td style='float:right'>"+symbol+str(data[1])+"</td></tr>"
                total_amount += data[1]
            body += "<tr><td style='border-top:1px solid;border-bottom:1px solid;'>Total :</td><td style='border-top:1px solid;border-bottom:1px solid;float:right'>"+symbol+str(total_amount)+"</td></tr>"
            # Stock Data
            total_amount = 0.0
            body += "</table><br/><br/><b>Stock Figure</b><table>"
            for data in stock_data:
                body += "<tr><td>"+data[0]+"     :</td><td style='float:right'>"+symbol+str(data[1])+"</td></tr>"
                total_amount += data[1]
            body += "<tr><td style='border-top:1px solid;border-bottom:1px solid;'>Total :</td><td style='border-top:1px solid;border-bottom:1px solid;float:right'>"+symbol+str(total_amount)+"</td></tr>"
            body += '</table></body></html>'
            email_to = ''
            user_ids = []
            group_check_total_id = self.pool.get('ir.model.data').get_object_reference(cr, uid, 'base', 'group_sale_manager')[1]
            group_check_total = self.pool.get('res.groups').browse(cr, uid, group_check_total_id, context=context)
            for x in group_check_total.users:
                if x.id not in user_ids:
                    user_ids.append(x.id)
                    email_to += x.email + ','
            group_check_total_id = self.pool.get('ir.model.data').get_object_reference(cr, uid, 'stock', 'group_stock_manager')[1]
            group_check_total = self.pool.get('res.groups').browse(cr, uid, group_check_total_id, context=context)
            for x in group_check_total.users:
                if x.id not in user_ids:
                    user_ids.append(x.id)
                    email_to += x.email + ','
            group_check_total_id = self.pool.get('ir.model.data').get_object_reference(cr, uid, 'purchase', 'group_purchase_manager')[1]
            group_check_total = self.pool.get('res.groups').browse(cr, uid, group_check_total_id, context=context)
            for x in group_check_total.users:
                if x.id not in user_ids:
                    user_ids.append(x.id)
                    email_to += x.email + ','
#             if group_check_total and uid in [x.id for x in group_check_total.users]:
            subject = "Openerp/Odoo weekly Report for " +user_rec.company_id.name +"as @ " + today_date
            vals = {'email_from': user_rec.email,
                            'email_to': email_to,
                            'state': 'outgoing',
                            'subject': subject,
                            'body_html': body,
                            'type':'email',
                            'auto_delete': True}
            mail_ids = []
            mail_ids.append(self.pool.get('mail.mail').create(cr, uid, vals, context=context))
            mail_obj.send(cr, uid, mail_ids, context = context)
        return True

    def get_monthly_report(self, cr, uid, context = None):
        if not context:
            context = {}
        shop_obj = self.pool.get('stock.warehouse')
        mail_obj = self.pool.get('mail.mail')
        sale_obj = self.pool.get('sale.order')
        invoice_obj = self.pool.get('account.invoice')
        product_obj = self.pool.get('product.product')
        purchase_obj = self.pool.get('purchase.order')
        voucher_obj = self.pool.get('account.voucher')
        user_rec = self.pool.get("res.users").browse(cr, uid, 1, context = context)
        shop_ids = shop_obj.search(cr, uid, [], context = context)
        sale_data = []
        stock_data = []
        expense_data = []
        if shop_ids:
            for shop in shop_obj.browse(cr, uid, shop_ids, context = context):
                amount_total = 0.0
                today_date_obj = datetime.datetime.now()
                today_date = today_date_obj.strftime(tools.DEFAULT_SERVER_DATE_FORMAT)
                from_date = (today_date_obj + dateutil.relativedelta.relativedelta(months=-1)).strftime(tools.DEFAULT_SERVER_DATE_FORMAT)
                sale_ids = sale_obj.search(cr, uid, [('shop_id','=',shop.id)], context = context)
                sale_recs = sale_obj.browse(cr, uid, sale_ids, context = context)
                invoice_ids = []
                for s_rec in sale_recs:
                    if s_rec.invoice_ids:
                        for invoice in s_rec.invoice_ids:
                            invoice_ids.append(invoice.id)
                if invoice_ids:
                    invoice_ids = invoice_obj.search(cr, uid, [('id', 'in', invoice_ids), '&',('date_invoice','<=',today_date),
                                                               ('date_invoice','>=',from_date)])
                    for invoice in invoice_obj.browse(cr, uid, invoice_ids, context = context):
                        amount_total += invoice.amount_total
                sale_data.append([shop.name, amount_total])
                
                product_ids = product_obj.search(cr, uid, [], context = context)
                amount_total = 0.0
                for product in product_obj.browse(cr, uid, product_ids, context = context):
                    context.update({'warehouse': shop.id, 'from_date': today_date, 'to_date': from_date})
                    data = product_obj._product_available(cr, uid, [product.id], field_names=None, arg=False, context=context)
                    #context.update({'shop':shop.id,'states': ('done',), 'what': ('in', 'out'), 'from_date':today_date, 'to_date':from_date})
                    #data = product_obj.get_product_available(cr, uid, [product.id], context = context)
                    if data.get(product.id):
                        amount_total += data.get(product.id)['qty_available'] * product.standard_price
                stock_data.append([shop.name,amount_total])
                amount_total = 0.0
                invoice_ids = invoice_obj.search(cr, uid, [('type','=','in_invoice'),('shop_id','=',shop.id),
                                                            '&',('date_invoice','<=',today_date), ('date_invoice','>=',from_date)])
                for invoice in invoice_obj.browse(cr, uid, invoice_ids, context = context):
                    amount_total += invoice.amount_total
                voucher_id = voucher_obj.search(cr, uid, [('shop_id','=',shop.id),
                                                          ('type', 'in', ['purchase','payment','receipt']),
                                                          '&',('date','<=',today_date), ('date','>=',from_date)])
                for voucher in voucher_obj.browse(cr, uid, voucher_id, context = context):
                    amount_total += voucher.amount
                expense_data.append([shop.name,amount_total])
            symbol = user_rec.company_id.currency_id.symbol
            body = "<html><body><b>Sales Figure</b><table>"
            total_amount = 0.0
            for data in sale_data:
                body += "<tr><td>"+data[0]+"     :</td><td style='float:right'>"+symbol+str(data[1])+"</td></tr>"
                total_amount += data[1]
            body += "<tr><td style='border-top:1px solid;border-bottom:1px solid;'>Total :</td><td style='border-top:1px solid;border-bottom:1px solid;float:right'>"+symbol+str(total_amount)+"</td></tr>"
            # Expense Data
            body += "</table><br/><br/><b>Expense Calculation</b><table>"
            total_amount = 0.0
            for data in expense_data:
                body += "<tr><td>"+data[0]+"     :</td><td style='float:right'>"+symbol+str(data[1])+"</td></tr>"
                total_amount += data[1]
            body += "<tr><td style='border-top:1px solid;border-bottom:1px solid;'>Total :</td><td style='border-top:1px solid;border-bottom:1px solid;float:right'>"+symbol+str(total_amount)+"</td></tr>"
            # Stock Data
            total_amount = 0.0
            body += "</table><br/><br/><b>Stock Figure</b><table>"
            for data in stock_data:
                body += "<tr><td>"+data[0]+"     :</td><td style='float:right'>"+symbol+str(data[1])+"</td></tr>"
                total_amount += data[1]
            body += "<tr><td style='border-top:1px solid;border-bottom:1px solid;'>Total :</td><td style='border-top:1px solid;border-bottom:1px solid;float:right'>"+symbol+str(total_amount)+"</td></tr>"
            body += '</table></body></html>'
            email_to = ''
            user_ids = []
            group_check_total_id = self.pool.get('ir.model.data').get_object_reference(cr, uid, 'base', 'group_sale_manager')[1]
            group_check_total = self.pool.get('res.groups').browse(cr, uid, group_check_total_id, context=context)
            for x in group_check_total.users:
                if x.id not in user_ids:
                    user_ids.append(x.id)
                    email_to += x.email + ','
            group_check_total_id = self.pool.get('ir.model.data').get_object_reference(cr, uid, 'stock', 'group_stock_manager')[1]
            group_check_total = self.pool.get('res.groups').browse(cr, uid, group_check_total_id, context=context)
            for x in group_check_total.users:
                if x.id not in user_ids:
                    user_ids.append(x.id)
                    email_to += x.email + ','
            group_check_total_id = self.pool.get('ir.model.data').get_object_reference(cr, uid, 'purchase', 'group_purchase_manager')[1]
            group_check_total = self.pool.get('res.groups').browse(cr, uid, group_check_total_id, context=context)
            for x in group_check_total.users:
                if x.id not in user_ids:
                    user_ids.append(x.id)
                    email_to += x.email + ','
#             if group_check_total and uid in [x.id for x in group_check_total.users]:
            subject = "Openerp/Odoo Monthly Report for " +user_rec.company_id.name +"as @ " + today_date
            vals = {'email_from': user_rec.email,
                            'email_to': email_to,
                            'state': 'outgoing',
                            'subject': subject,
                            'body_html': body,
                            'type':'email',
                            'auto_delete': True}
            mail_ids = []
            mail_ids.append(self.pool.get('mail.mail').create(cr, uid, vals, context=context))
            mail_obj.send(cr, uid, mail_ids, context = context)
        return True

